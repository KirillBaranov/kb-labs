package orchestrator

import (
	"fmt"
	"io"
	"sync"
	"time"

	"github.com/kb-labs/kb-deploy/internal/config"
	"github.com/kb-labs/kb-deploy/internal/remote"
)

// HostResolver returns a Host object for the given host name. Typically wraps
// an SSH dialer; tests pass a fake.
type HostResolver func(hostName string) (*remote.Host, error)

// ExecuteOptions configures an Execute run.
type ExecuteOptions struct {
	Plan     *Plan
	Config   *config.Config
	Resolver HostResolver
	Stdout   io.Writer
	Stderr   io.Writer
}

// Result records what happened per action.
type Result struct {
	Actions []ActionResult
	// Rolled back lists hosts whose release was reverted due to a wave failure.
	RolledBack []ActionResult
	// Err is non-nil if any wave failed (even if rollback succeeded).
	Err error
}

// ActionResult is the outcome of one (host, service) action.
type ActionResult struct {
	Action    Action
	Completed bool
	ReleaseID string // what ended up current after the action; empty on failure
	Err       error
}

// Execute runs the plan wave by wave. Within a wave, hosts execute in parallel
// up to rollout.Parallel; between waves the health gate enforces ordering.
// On any wave failure, if AutoRollback is enabled, all successfully-swapped
// hosts in that wave are rolled back before Execute returns the error.
func Execute(opts ExecuteOptions) *Result {
	if opts.Stdout == nil {
		opts.Stdout = io.Discard
	}
	if opts.Stderr == nil {
		opts.Stderr = io.Discard
	}
	parallel := 1
	autoRollback := false
	if opts.Config.Rollout != nil {
		if opts.Config.Rollout.Parallel > 0 {
			parallel = opts.Config.Rollout.Parallel
		}
		autoRollback = opts.Config.Rollout.AutoRollback
	}

	res := &Result{}
	for waveIdx, wave := range opts.Plan.Waves {
		fmt.Fprintf(opts.Stdout, "\n=== Wave %d/%d (%d actions) ===\n",
			waveIdx+1, len(opts.Plan.Waves), len(wave))

		waveResults := runWave(wave, parallel, opts)
		res.Actions = append(res.Actions, waveResults...)

		failed := false
		for _, r := range waveResults {
			if r.Err != nil {
				failed = true
				break
			}
		}
		if !failed {
			continue
		}

		// Wave failed. Handle rollback if enabled.
		res.Err = fmt.Errorf("wave %d failed", waveIdx+1)
		if !autoRollback {
			return res
		}
		fmt.Fprintf(opts.Stderr, "wave %d failed; attempting auto-rollback of completed hosts\n", waveIdx+1)
		rolled := rollbackWave(waveResults, opts)
		res.RolledBack = rolled
		return res
	}
	return res
}

// runWave executes one wave with bounded parallelism. Returns per-action results
// in the same order as the input wave.
func runWave(actions []Action, parallel int, opts ExecuteOptions) []ActionResult {
	results := make([]ActionResult, len(actions))

	sem := make(chan struct{}, parallel)
	var wg sync.WaitGroup
	for i, act := range actions {
		wg.Add(1)
		sem <- struct{}{}
		go func(i int, a Action) {
			defer wg.Done()
			defer func() { <-sem }()
			results[i] = runAction(a, opts)
		}(i, act)
	}
	wg.Wait()
	return results
}

// runAction performs the install/swap/restart/skip on a single host.
func runAction(a Action, opts ExecuteOptions) ActionResult {
	res := ActionResult{Action: a}
	if a.Kind == ActionSkip {
		res.Completed = true
		res.ReleaseID = a.ToID
		return res
	}

	host, err := opts.Resolver(a.Host)
	if err != nil {
		res.Err = fmt.Errorf("resolve host %s: %w", a.Host, err)
		return res
	}

	svc := opts.Config.Services[a.Service]

	switch a.Kind {
	case ActionInstall:
		installRes, err := host.InstallService(remote.InstallOpts{
			ServicePkg: svc.Service,
			Version:    svc.Version,
			Adapters:   svc.Adapters,
			Plugins:    svc.Plugins,
			Registry:   platformRegistry(opts.Config),
			// KeepReleases left at 0 so install-service uses its default (3).
		})
		if err != nil {
			res.Err = err
			return res
		}
		if err := host.Swap(svc.Service, installRes.ReleaseID); err != nil {
			res.Err = err
			return res
		}
		res.ReleaseID = installRes.ReleaseID

	case ActionSwap:
		if err := host.Swap(svc.Service, a.ToID); err != nil {
			res.Err = err
			return res
		}
		res.ReleaseID = a.ToID

	case ActionRestart:
		// Nothing to do here — restart happens below.
		res.ReleaseID = a.FromID
	}

	// Restart + wait healthy.
	healthGate := parseHealthGate(svc.Targets.HealthGate)
	serviceShort := serviceShortName(svc.Service)
	if err := host.RestartAndWaitHealthy(serviceShort, healthGate); err != nil {
		res.Err = err
		return res
	}
	res.Completed = true
	return res
}

// rollbackWave rolls back every wave action that swapped successfully.
// We only call remote.Rollback (swap back to previous) — install artefacts
// stay on disk in releases/ so forward retries stay idempotent.
func rollbackWave(waveResults []ActionResult, opts ExecuteOptions) []ActionResult {
	var rolled []ActionResult
	for _, r := range waveResults {
		if !r.Completed {
			continue
		}
		if r.Action.Kind != ActionInstall && r.Action.Kind != ActionSwap {
			continue
		}
		host, err := opts.Resolver(r.Action.Host)
		if err != nil {
			rolled = append(rolled, ActionResult{Action: r.Action, Err: err})
			continue
		}
		svc := opts.Config.Services[r.Action.Service]
		rollErr := host.Rollback(svc.Service)
		ar := ActionResult{Action: r.Action, Err: rollErr, Completed: rollErr == nil}
		if rollErr == nil {
			// Restart again to come up on the previous release.
			serviceShort := serviceShortName(svc.Service)
			if err := host.RestartAndWaitHealthy(serviceShort, parseHealthGate(svc.Targets.HealthGate)); err != nil {
				ar.Err = err
				ar.Completed = false
			}
		}
		rolled = append(rolled, ar)
	}
	return rolled
}

// platformRegistry returns the registry to use, or "" if none configured.
func platformRegistry(c *config.Config) string {
	if c.Platform != nil && c.Platform.Registry != "" {
		return c.Platform.Registry
	}
	return ""
}

// parseHealthGate returns the configured duration, or a 30s default.
func parseHealthGate(s string) time.Duration {
	if s == "" {
		return 30 * time.Second
	}
	d, err := time.ParseDuration(s)
	if err != nil || d <= 0 {
		return 30 * time.Second
	}
	return d
}

// serviceShortName mirrors releases.ServiceShort without importing the kb-create
// package (no dependency cycle). Returns the name after the last "/".
func serviceShortName(pkg string) string {
	// Simplest form: last segment of "@scope/name".
	for i := len(pkg) - 1; i >= 0; i-- {
		if pkg[i] == '/' {
			return pkg[i+1:]
		}
	}
	return pkg
}
