package cmd

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/kb-labs/kb-deploy/internal/config"
	"github.com/kb-labs/kb-deploy/internal/jsonc"
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
	CfgPath  string
	Cfg      *config.Config
	Hosts    map[string]*remote.Host
	CloseAll func()
	States   map[string]orchestrator.HostState
	Plan     *orchestrator.Plan
	Lock     *lock.Lock // may be nil (no lock yet)
	Drift    []DriftItem
	Configs  map[string]deliveredConfig // per-host rendered config; nil when none declared
}

// fetchIntegrities resolves the registry content digest for every distinct
// service package@version in the config, querying it on a target host (the
// platform registry is often a host-local Verdaccio). The result keys are
// "<pkg>@<version>". Any failure aborts apply with ERR_REGISTRY_INTEGRITY.
func fetchIntegrities(cfg *config.Config, hosts map[string]*remote.Host) (map[string]string, error) {
	registry := ""
	if cfg.Platform != nil {
		registry = cfg.Platform.Registry
	}
	out := make(map[string]string)
	names := make([]string, 0, len(cfg.Services))
	for n := range cfg.Services {
		names = append(names, n)
	}
	sort.Strings(names)
	for _, name := range names {
		svc := cfg.Services[name]
		key := svc.Service + "@" + svc.Version
		if _, done := out[key]; done {
			continue
		}
		host, err := firstConnectedHost(svc.Targets.Hosts, hosts)
		if err != nil {
			return nil, fmt.Errorf("services.%s: %w", name, err)
		}
		integ, err := host.PackageIntegrity(svc.Service, svc.Version, registry)
		if err != nil {
			return nil, err
		}
		out[key] = integ
	}
	return out, nil
}

// firstConnectedHost returns the first target host that has an open connection.
func firstConnectedHost(targets []string, hosts map[string]*remote.Host) (*remote.Host, error) {
	for _, name := range targets {
		if h, ok := hosts[name]; ok {
			return h, nil
		}
	}
	return nil, fmt.Errorf("no connected target host among %v", targets)
}

// deliveredConfig is the per-host config payload prepared on the control
// machine before any host is touched. JSONC/Env are streamed to the host over
// stdin; Hash is committed to the lock to detect config-only changes.
type deliveredConfig struct {
	JSONC string // rendered config file, verbatim
	Env   string // resolved .env body ("KEY=VALUE\n"...), may be empty
	Hash  string // sha256(jsonc + resolved env); includes values so rotation is seen
}

// DriftItem describes a mismatch between lock (desired-as-previously-applied)
// and observed state on target (D6).
type DriftItem struct {
	Host     string
	Service  string // logical service name from deploy.yaml
	LockSays string // release id recorded in lock
	Target   string // release id observed on target
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

	// Prepare + preflight per-host config before any host is dialed or mutated
	// (fail-fast: a broken config or unresolved secret aborts before SSH).
	configs, err := prepareConfigs(cfg, resolver, filepath.Dir(cfgPath))
	if err != nil {
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

	// Content-aware ids: fetch each service package's registry integrity so a
	// same-version content patch yields a new id (install, not skip). Fail-fast
	// here — the registry is required for apply anyway.
	integrities, err := fetchIntegrities(cfg, hosts)
	if err != nil {
		closeAll()
		return nil, err
	}

	plan, err := orchestrator.ComputePlan(cfg, states, func(svc config.Service) string {
		key := svc.Service + "@" + svc.Version
		return releaseid.ComputeID(svc.Service, svc.Version, integrities[key], svc.Adapters, svc.Plugins)
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
		Configs:  configs,
	}, nil
}

// prepareConfigs reads the rendered platform config, validates it, resolves
// each host's env, and returns the per-host payload to deliver. Everything
// here runs on the control machine before any host is touched, so a broken
// config or unresolved/empty secret fails fast without partial mutation.
//
// Returns (nil, nil) when no platform.config is declared — config delivery is
// opt-in; apply still installs/swaps services.
func prepareConfigs(cfg *config.Config, r *secrets.Resolver, deployDir string) (map[string]deliveredConfig, error) {
	if cfg.Platform == nil || cfg.Platform.Config == "" {
		return nil, nil
	}

	cfgPath := filepath.Join(deployDir, cfg.Platform.Config)
	jsoncBytes, err := os.ReadFile(cfgPath) //nolint:gosec // path from trusted deploy.yaml
	if err != nil {
		return nil, fmt.Errorf("read platform.config %q: %w", cfg.Platform.Config, err)
	}
	if err := jsonc.Valid(jsoncBytes); err != nil {
		return nil, fmt.Errorf("platform.config %q: %w", cfg.Platform.Config, err)
	}
	jsoncStr := string(jsoncBytes)

	out := map[string]deliveredConfig{}
	for _, name := range referencedHosts(cfg) {
		host, ok := cfg.Hosts[name]
		if !ok {
			return nil, fmt.Errorf("host %q referenced by services but not defined in hosts:", name)
		}

		// Reject any reference that resolves to an empty value — almost always
		// a misconfigured secret backend, and silently shipping it would start
		// daemons with blank credentials.
		for k, v := range host.Env {
			if err := checkNonEmptyRefs(r, v); err != nil {
				return nil, fmt.Errorf("hosts.%s.env.%s: %w", name, k, err)
			}
		}

		resolved, err := r.ExpandMap(host.Env)
		if err != nil {
			return nil, fmt.Errorf("hosts.%s.env: %w", name, err)
		}

		envBody := renderDotEnv(resolved)
		out[name] = deliveredConfig{
			JSONC: jsoncStr,
			Env:   envBody,
			Hash:  configHash(jsoncStr, envBody),
		}
	}
	return out, nil
}

// referencedHosts returns the sorted set of host names referenced by services.
func referencedHosts(cfg *config.Config) []string {
	seen := map[string]struct{}{}
	for _, svc := range cfg.Services {
		for _, h := range svc.Targets.Hosts {
			seen[h] = struct{}{}
		}
	}
	names := make([]string, 0, len(seen))
	for n := range seen {
		names = append(names, n)
	}
	sort.Strings(names)
	return names
}

// checkNonEmptyRefs errors if any ${secrets.X}/${env.X} in val is present in
// its backend but resolves to an empty string. Missing refs are left to
// ExpandMap, which reports them as unresolved.
func checkNonEmptyRefs(r *secrets.Resolver, val string) error {
	secs, envs := secrets.References(val)
	for _, n := range secs {
		if r.Secrets != nil {
			if v, ok := r.Secrets.Lookup(n); ok && v == "" {
				return fmt.Errorf("${secrets.%s} resolved to empty", n)
			}
		}
	}
	for _, n := range envs {
		if r.Env != nil {
			if v, ok := r.Env.Lookup(n); ok && v == "" {
				return fmt.Errorf("${env.%s} resolved to empty", n)
			}
		}
	}
	return nil
}

// renderDotEnv builds a deterministic KEY=VALUE .env body with sorted keys.
func renderDotEnv(env map[string]string) string {
	if len(env) == 0 {
		return ""
	}
	keys := make([]string, 0, len(env))
	for k := range env {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	for _, k := range keys {
		b.WriteString(k)
		b.WriteByte('=')
		b.WriteString(env[k])
		b.WriteByte('\n')
	}
	return b.String()
}

// configHash is a one-way digest over the rendered config plus resolved env.
// Resolved values are included so rotating a secret (same keys, new value)
// changes the hash and forces a restart. The digest is safe to commit to the
// lock; raw values are never persisted.
func configHash(jsoncStr, envBody string) string {
	h := sha256.New()
	h.Write([]byte(jsoncStr))
	h.Write([]byte{0})
	h.Write([]byte(envBody))
	return hex.EncodeToString(h.Sum(nil))
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
