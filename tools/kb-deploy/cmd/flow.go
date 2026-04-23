package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/kb-labs/kb-deploy/internal/config"
	"github.com/kb-labs/kb-deploy/internal/lock"
	"github.com/kb-labs/kb-deploy/internal/orchestrator"
	"github.com/kb-labs/kb-deploy/internal/releaseid"
	"github.com/kb-labs/kb-deploy/internal/remote"
	"github.com/kb-labs/kb-deploy/internal/secrets"
	"github.com/kb-labs/kb-deploy/internal/ssh"
)

// applyFlow is the shared preamble of `apply` and `plan`.
// It loads + validates the config, resolves secrets, opens SSH connections,
// collects host states, computes the plan, and detects drift against the lock.
type applyFlow struct {
	CfgPath   string
	Cfg       *config.Config
	Hosts     map[string]*remote.Host
	CloseAll  func()
	States    map[string]orchestrator.HostState
	Plan      *orchestrator.Plan
	Lock      *lock.Lock // may be nil (no lock yet)
	Drift     []DriftItem
}

// DriftItem describes a mismatch between lock (desired-as-previously-applied)
// and observed state on target (D6).
type DriftItem struct {
	Host      string
	Service   string   // logical service name from deploy.yaml
	LockSays  string   // release id recorded in lock
	Target    string   // release id observed on target
}

// loadFlow runs the shared preamble. Caller must defer CloseAll().
func loadFlow() (*applyFlow, error) {
	cfgPath, err := resolveDeployPath()
	if err != nil {
		return nil, err
	}
	repoRoot := config.RepoRoot(cfgPath)

	cfg, err := config.Load(cfgPath, repoRoot)
	if err != nil {
		return nil, err
	}
	if err := config.ValidateForApply(cfg); err != nil {
		return nil, err
	}

	resolver := &secrets.Resolver{
		Secrets: secrets.BackendFromRoot(repoRoot),
		Env:     secrets.BackendFromRoot(repoRoot),
	}
	if err := validateSecrets(cfg, resolver); err != nil {
		return nil, err
	}

	// Existing lock (optional).
	l, err := lock.Load(cfgPath)
	if err != nil {
		return nil, fmt.Errorf("load lock: %w", err)
	}

	hosts, closeAll, err := dialHosts(cfg)
	if err != nil {
		return nil, err
	}
	states, err := collectHostStates(cfg, hosts)
	if err != nil {
		closeAll()
		return nil, err
	}

	plan, err := orchestrator.ComputePlan(cfg, states, func(svc config.Service) string {
		return releaseid.ComputeID(svc.Service, svc.Version, svc.Adapters, svc.Plugins)
	})
	if err != nil {
		closeAll()
		return nil, err
	}

	drift := detectDrift(cfg, l, states)

	return &applyFlow{
		CfgPath:  cfgPath,
		Cfg:      cfg,
		Hosts:    hosts,
		CloseAll: closeAll,
		States:   states,
		Plan:     plan,
		Lock:     l,
		Drift:    drift,
	}, nil
}

// detectDrift compares lock.appliedTo[host].releaseId with states[host].Current[service]
// and returns mismatches. Fresh deployments (no lock) produce no drift.
func detectDrift(cfg *config.Config, l *lock.Lock, states map[string]orchestrator.HostState) []DriftItem {
	if l == nil {
		return nil
	}
	var drift []DriftItem
	for svcName, svcLock := range l.Services {
		svc, ok := cfg.Services[svcName]
		if !ok {
			continue
		}
		for host, app := range svcLock.AppliedTo {
			state, known := states[host]
			if !known || state.Missing {
				continue
			}
			observed := state.Current[svc.Service]
			if observed != "" && observed != app.ReleaseID {
				drift = append(drift, DriftItem{
					Host:     host,
					Service:  svcName,
					LockSays: app.ReleaseID,
					Target:   observed,
				})
			}
		}
	}
	return drift
}

// resolveDeployPath returns the deploy.yaml path from --config or by discovery.
func resolveDeployPath() (string, error) {
	if configPath != "" {
		return configPath, nil
	}
	cwd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	return config.Discover(cwd)
}

// validateSecrets walks every ${secrets.X} / ${env.X} reference in deploy.yaml
// env blocks and ensures the resolver can find each one.
func validateSecrets(cfg *config.Config, r *secrets.Resolver) error {
	var missing []string
	for svcName, svc := range cfg.Services {
		for k, v := range svc.Env {
			if _, err := r.Expand(v); err != nil {
				missing = append(missing, fmt.Sprintf("services.%s.env.%s: %v", svcName, k, err))
			}
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("unresolved secrets:\n  %s", strings.Join(missing, "\n  "))
	}
	return nil
}

// dialHosts opens one SSH client per host in the config. Returns a closer that
// cleans them all up.
func dialHosts(cfg *config.Config) (map[string]*remote.Host, func(), error) {
	hosts := map[string]*remote.Host{}
	var closers []func()
	closeAll := func() {
		for _, c := range closers {
			c()
		}
	}

	needed := map[string]struct{}{}
	for _, svc := range cfg.Services {
		for _, h := range svc.Targets.Hosts {
			needed[h] = struct{}{}
		}
	}

	for name := range needed {
		hc, ok := cfg.Hosts[name]
		if !ok {
			closeAll()
			return nil, nil, fmt.Errorf("host %q referenced by services but not defined in hosts:", name)
		}
		keyPEM, err := readSSHKey(hc.SSH)
		if err != nil {
			closeAll()
			return nil, nil, fmt.Errorf("host %s: %w", name, err)
		}
		client, err := ssh.New(hc.SSH.Host, hc.SSH.User, keyPEM, hc.SSH.Port)
		if err != nil {
			closeAll()
			return nil, nil, fmt.Errorf("ssh %s@%s: %w", hc.SSH.User, hc.SSH.Host, err)
		}
		c := client
		closers = append(closers, c.Close)

		platformPath := hc.PlatformPath
		if platformPath == "" {
			platformPath = "~/kb-platform"
		}
		hosts[name] = &remote.Host{Name: name, Runner: c, PlatformPath: platformPath}
	}
	return hosts, closeAll, nil
}

// collectHostStates pulls current releases state from every host.
func collectHostStates(_ *config.Config, hosts map[string]*remote.Host) (map[string]orchestrator.HostState, error) {
	states := map[string]orchestrator.HostState{}
	for name := range hosts {
		h := hosts[name]
		rep, err := h.CurrentReleases()
		if err != nil {
			states[name] = orchestrator.HostState{Host: name, Missing: true}
			continue
		}
		if rep == nil || len(rep.Current) == 0 {
			states[name] = orchestrator.HostState{Host: name, Missing: rep == nil || len(rep.Releases) == 0}
			continue
		}
		states[name] = orchestrator.HostState{
			Host:    name,
			Current: rep.Current,
		}
	}
	return states, nil
}
