package orchestrator

import (
	"fmt"
	"io"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/kb-labs/clikit/diag"

	"github.com/kb-labs/kb-deploy/internal/config"
	"github.com/kb-labs/kb-deploy/internal/remote"
)

// HostResolver returns a Host object for the given host name. Typically wraps
// an SSH dialer; tests pass a fake.
type HostResolver func(hostName string) (*remote.Host, error)

// HostConfig is the rendered runtime config to deliver to one host before any
// install/swap. Prepared on the control machine (see cmd.prepareConfigs).
type HostConfig struct {
	JSONC string // config file contents, delivered verbatim
	Env   string // resolved .env body, may be empty
	Hash  string // digest over JSONC + resolved env (config-change detection)
}

// ExecuteOptions configures an Execute run.
type ExecuteOptions struct {
	Plan     *Plan
	Config   *config.Config
	Resolver HostResolver
	Stdout   io.Writer
	Stderr   io.Writer
	// Configs is the per-host runtime config to deliver before the waves run.
	// Nil/empty means no config delivery (services still install/swap).
	Configs map[string]HostConfig
	// PrevConfigHash is the per-host config hash from the lock. A host whose
	// current hash differs gets a forced restart even when its release is
	// unchanged (config-only change).
	PrevConfigHash map[string]string
	// ServiceEnv carries the resolved deploy.yaml per-service env overrides,
	// keyed by service logical name. Passed to `kb-create swap --env` so the
	// devservices entry kb-dev launches reflects deploy-time config (e.g. a
	// Studio PORT override). Nil/absent → manifest defaults only.
	ServiceEnv map[string]map[string]string
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

	// Deliver per-host config before any host is mutated. A failure here aborts
	// before install/swap and restores config on hosts already written to.
	forceRestart, err := deliverConfigs(opts)
	if err != nil {
		res.Err = err
		return res
	}

	for waveIdx, wave := range opts.Plan.Waves {
		fmt.Fprintf(opts.Stdout, "\n=== Wave %d/%d (%d actions) ===\n",
			waveIdx+1, len(opts.Plan.Waves), len(wave))

		waveResults := runWave(wave, parallel, opts, forceRestart)
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

		// Wave failed. Build a structured diagnostic carrying every per-action
		// failure (kind/service/host/error) so the cause is never reduced to an
		// opaque "wave N failed".
		res.Err = waveDiag(waveIdx+1, waveResults)
		if !autoRollback {
			return res
		}
		fmt.Fprintf(opts.Stderr, "wave %d failed; attempting auto-rollback of completed hosts\n", waveIdx+1)
		rolled := rollbackWave(waveResults, opts, forceRestart)
		res.RolledBack = rolled
		// Rollback fired → distinct exit code (3) recorded in the diagnostic.
		if d, ok := res.Err.(*diag.Diag); ok {
			d.Meta["rolledBack"] = len(rolled)
			d.Meta["exitCode"] = diag.ExitForbidden
		}
		return res
	}
	return res
}

// waveDiag turns a failed wave's per-action results into a structured Diag:
// Message says which wave failed, Reason summarizes each failure, and Meta
// carries the machine-readable failure list. exitCode defaults to ExitConfig
// (2); the rollback path overrides it to ExitForbidden (3).
func waveDiag(wave int, results []ActionResult) *diag.Diag {
	var failures []map[string]any
	var reasons []string
	for _, r := range results {
		if r.Err == nil {
			continue
		}
		failures = append(failures, map[string]any{
			"kind":    string(r.Action.Kind),
			"service": r.Action.Service,
			"host":    r.Action.Host,
			"error":   r.Err.Error(),
		})
		reasons = append(reasons, fmt.Sprintf("%s %s@%s: %v",
			r.Action.Kind, r.Action.Service, r.Action.Host, r.Err))
	}
	return diag.New("ERR_WAVE_FAILED",
		fmt.Sprintf("deploy wave %d failed", wave),
		diag.WithReason(strings.Join(reasons, "; ")),
		diag.WithMeta(map[string]any{
			"wave":     wave,
			"failures": failures,
			"exitCode": diag.ExitConfig,
		}),
	)
}

// deliverConfigs writes each host's rendered config before the waves run. It
// returns the set of hosts whose config changed (forced restart). On any
// failure it restores config on hosts already written to, then returns the
// error so Execute aborts before touching releases.
func deliverConfigs(opts ExecuteOptions) (map[string]bool, error) {
	if len(opts.Configs) == 0 {
		return nil, nil
	}
	forceRestart := map[string]bool{}
	var delivered []string

	names := make([]string, 0, len(opts.Configs))
	for n := range opts.Configs {
		names = append(names, n)
	}
	sort.Strings(names)

	for _, name := range names {
		host, err := opts.Resolver(name)
		if err != nil {
			restoreConfigs(opts, delivered)
			return nil, diag.Wrap(err, "ERR_CONFIG_DELIVERY",
				fmt.Sprintf("could not resolve host %q for config delivery", name),
				diag.WithReason(err.Error()),
				diag.WithMeta(map[string]any{"host": name}))
		}
		hc := opts.Configs[name]
		if err := host.DeliverConfig(hc.JSONC, hc.Env); err != nil {
			restoreConfigs(opts, delivered)
			return nil, diag.Wrap(err, "ERR_CONFIG_DELIVERY",
				fmt.Sprintf("config delivery to host %q failed", name),
				diag.WithReason(err.Error()),
				diag.WithMeta(map[string]any{"host": name}))
		}
		delivered = append(delivered, name)
		if opts.PrevConfigHash[name] != hc.Hash {
			forceRestart[name] = true
		}
	}
	return forceRestart, nil
}

// restoreConfigs rolls back delivered config on the given hosts (best-effort).
func restoreConfigs(opts ExecuteOptions, hosts []string) {
	for _, name := range hosts {
		host, err := opts.Resolver(name)
		if err != nil {
			continue
		}
		if err := host.RestoreConfig(); err != nil {
			fmt.Fprintf(opts.Stderr, "warning: restore config on %s failed: %v\n", name, err)
		}
	}
}

// runWave executes one wave in three phases so the on-host devservices.yaml is
// complete and self-consistent before any service is (re)started:
//
//  1. prepare — install + swap every action (no restart), bounded-parallel.
//  2. reconcile — once per host, prune devservices dependsOn entries that name
//     services absent from the registry (external infra, or not in this deploy),
//     so kb-dev's strict validation can load it.
//  3. restart — restart each service through its health gate, bounded-parallel.
//
// Restarting per service immediately after its own install (the old behaviour)
// failed when services cross-depend: a dependent could be restarted before its
// dependency was registered, and kb-dev rejected the whole config. Phasing
// removes that ordering hazard. A prepare/reconcile failure short-circuits the
// remaining phases so the caller's rollback runs against a known state.
func runWave(actions []Action, parallel int, opts ExecuteOptions, forceRestart map[string]bool) []ActionResult {
	results := make([]ActionResult, len(actions))
	needsRestart := make([]bool, len(actions))

	// Phase 1 — install + swap.
	runConcurrent(len(actions), parallel, func(i int) {
		results[i], needsRestart[i] = prepareAction(actions[i], opts, forceRestart)
	})
	if anyActionErr(results) {
		return results
	}

	// Phase 2 — reconcile devservices once per host that changed.
	for _, host := range uniqueRestartHosts(actions, needsRestart) {
		h, err := opts.Resolver(host)
		if err != nil {
			setHostErr(results, actions, host, fmt.Errorf("resolve host %s: %w", host, err))
			return results
		}
		out, err := h.ReconcileDevservices()
		if out != "" {
			fmt.Fprint(opts.Stdout, out)
		}
		if err != nil {
			setHostErr(results, actions, host, err)
			return results
		}
	}

	// Phase 3 — restart + health gate.
	runConcurrent(len(actions), parallel, func(i int) {
		if !needsRestart[i] || results[i].Err != nil {
			return
		}
		results[i] = restartAction(actions[i], results[i], opts)
	})
	return results
}

// runConcurrent runs fn(0..n-1) with at most `parallel` in flight.
func runConcurrent(n, parallel int, fn func(i int)) {
	if parallel < 1 {
		parallel = 1
	}
	sem := make(chan struct{}, parallel)
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		sem <- struct{}{}
		go func(i int) {
			defer wg.Done()
			defer func() { <-sem }()
			fn(i)
		}(i)
	}
	wg.Wait()
}

func anyActionErr(results []ActionResult) bool {
	for _, r := range results {
		if r.Err != nil {
			return true
		}
	}
	return false
}

// uniqueRestartHosts returns the distinct hosts that have at least one action
// needing a restart (i.e. something changed and reconcile is worthwhile).
func uniqueRestartHosts(actions []Action, needsRestart []bool) []string {
	seen := map[string]bool{}
	var hosts []string
	for i, a := range actions {
		if needsRestart[i] && !seen[a.Host] {
			seen[a.Host] = true
			hosts = append(hosts, a.Host)
		}
	}
	sort.Strings(hosts)
	return hosts
}

// setHostErr records err on every not-yet-failed action belonging to host, so a
// host-level (e.g. reconcile) failure is attributed and rolled back.
func setHostErr(results []ActionResult, actions []Action, host string, err error) {
	for i := range results {
		if actions[i].Host == host && results[i].Err == nil {
			results[i].Err = err
		}
	}
}

// prepareAction performs install + swap (no restart). needsRestart reports
// whether phase 3 must restart this action; a plain skip (no config change) is
// completed here with nothing to do.
func prepareAction(a Action, opts ExecuteOptions, forceRestart map[string]bool) (ActionResult, bool) {
	res := ActionResult{Action: a}
	if a.Kind == ActionSkip && !forceRestart[a.Host] {
		res.Completed = true
		res.ReleaseID = a.ToID
		return res, false
	}

	host, err := opts.Resolver(a.Host)
	if err != nil {
		res.Err = fmt.Errorf("resolve host %s: %w", a.Host, err)
		return res, false
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
			// Pin the dir name to the planner's content-aware desired id so the
			// installed release matches the plan exactly (no spec-only recompute).
			ReleaseID: a.ToID,
			// KeepReleases left at 0 so install-service uses its default.
		})
		if err != nil {
			res.Err = err
			return res, false
		}
		if installRes.ReleaseID == "" {
			// Defence in depth: InstallService already errors on an empty id, but
			// never let an empty release-id reach Swap (which fails obscurely with
			// "releaseID is required").
			res.Err = fmt.Errorf("install %s@%s on %s: empty release id",
				svc.Service, svc.Version, a.Host)
			return res, false
		}
		if err := host.Swap(svc.Service, installRes.ReleaseID, opts.ServiceEnv[a.Service]); err != nil {
			res.Err = err
			return res, false
		}
		res.ReleaseID = installRes.ReleaseID

	case ActionSwap:
		if err := host.Swap(svc.Service, a.ToID, opts.ServiceEnv[a.Service]); err != nil {
			res.Err = err
			return res, false
		}
		res.ReleaseID = a.ToID

	case ActionRestart:
		res.ReleaseID = a.FromID

	case ActionSkip:
		// Reached only when forceRestart is set (config-only change).
		res.ReleaseID = a.ToID
	}
	return res, true
}

// restartAction restarts the service through the health gate, completing res.
// kb-dev keys services by their manifest id (the devservices.yaml key kb-create
// registers), not the package short name — read it from the swapped release.
func restartAction(a Action, res ActionResult, opts ExecuteOptions) ActionResult {
	host, err := opts.Resolver(a.Host)
	if err != nil {
		res.Err = fmt.Errorf("resolve host %s: %w", a.Host, err)
		return res
	}
	svc := opts.Config.Services[a.Service]
	healthGate := parseHealthGate(svc.Targets.HealthGate)
	serviceID, err := host.ServiceID(svc.Service, serviceShortName(svc.Service))
	if err != nil {
		res.Err = err
		return res
	}
	if err := host.RestartAndWaitHealthy(serviceID, healthGate); err != nil {
		res.Err = err
		return res
	}
	res.Completed = true
	return res
}

// rollbackWave reverts a failed wave. For a host that swapped successfully it
// swaps back to the previous release; for a host whose only change was a
// config-only force-restart that failed, it restarts to recover the previous
// healthy state. Install artefacts stay on disk in releases/ so forward
// retries stay idempotent.
func rollbackWave(waveResults []ActionResult, opts ExecuteOptions, forceRestart map[string]bool) []ActionResult {
	// Restore config first, once per host, on every host this wave delivered
	// config to and is about to revert — otherwise the previous (or unchanged)
	// release would come up on the newly delivered config.
	restoreRollbackConfigs(waveResults, opts, forceRestart)

	var rolled []ActionResult
	for _, r := range waveResults {
		revertRelease, recoverConfig := rollbackKind(r, forceRestart)
		if !revertRelease && !recoverConfig {
			continue
		}
		host, err := opts.Resolver(r.Action.Host)
		if err != nil {
			rolled = append(rolled, ActionResult{Action: r.Action, Err: err})
			continue
		}
		svc := opts.Config.Services[r.Action.Service]

		ar := ActionResult{Action: r.Action}
		if revertRelease {
			if rollErr := host.Rollback(svc.Service); rollErr != nil {
				ar.Err = rollErr
				rolled = append(rolled, ar)
				continue
			}
		}
		// Restart to come up on the previous release (revertRelease) or on the
		// restored config (recoverConfig). kb-dev keys services by manifest id,
		// read from the (now current) release's manifest.
		serviceID, idErr := host.ServiceID(svc.Service, serviceShortName(svc.Service))
		if idErr != nil {
			ar.Err = idErr
			rolled = append(rolled, ar)
			continue
		}
		if err := host.RestartAndWaitHealthy(serviceID, parseHealthGate(svc.Targets.HealthGate)); err != nil {
			ar.Err = err
		} else {
			ar.Completed = true
		}
		rolled = append(rolled, ar)
	}
	return rolled
}

// rollbackKind classifies a failed wave's action: revertRelease is true when a
// successfully-swapped release must be swapped back; recoverConfig is true when
// the release was unchanged but a config-only force-restart failed and the host
// must be restarted on the restored config.
func rollbackKind(r ActionResult, forceRestart map[string]bool) (revertRelease, recoverConfig bool) {
	switch r.Action.Kind {
	case ActionInstall, ActionSwap:
		return r.Completed, false
	case ActionSkip, ActionRestart:
		// Release stays put; recover only if a forced config restart failed.
		if forceRestart[r.Action.Host] && r.Err != nil {
			return false, true
		}
	}
	return false, false
}

// restoreRollbackConfigs restores the previous config on each host this wave is
// about to revert and that had config delivered this run. Runs once per host,
// before any release swap-back or restart in rollbackWave. It is not gated on
// the config-changed flag: a reverted release must always come up on the config
// that matched it, even when the new and old hashes coincided.
func restoreRollbackConfigs(waveResults []ActionResult, opts ExecuteOptions, forceRestart map[string]bool) {
	seen := map[string]bool{}
	for _, r := range waveResults {
		revertRelease, recoverConfig := rollbackKind(r, forceRestart)
		if !revertRelease && !recoverConfig {
			continue
		}
		h := r.Action.Host
		if seen[h] {
			continue
		}
		if _, delivered := opts.Configs[h]; !delivered {
			continue
		}
		seen[h] = true
		host, err := opts.Resolver(h)
		if err != nil {
			continue
		}
		if err := host.RestoreConfig(); err != nil {
			fmt.Fprintf(opts.Stderr, "warning: restore config on %s during rollback failed: %v\n", h, err)
		}
	}
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
