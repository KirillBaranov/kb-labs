package orchestrator

import (
	"errors"
	"strings"
	"sync"
	"testing"

	"github.com/kb-labs/clikit/diag"

	"github.com/kb-labs/kb-deploy/internal/config"
	"github.com/kb-labs/kb-deploy/internal/remote"
)

// fakeRunner supports both success and targeted failure.
type fakeRunner struct {
	mu          sync.Mutex
	log         []string
	failOn      string // if set, commands containing this substring fail
	installOut  string
	releasesOut string
	manifestID  string // id returned for `cat .../manifest.json`; defaults to "gateway"
}

func (f *fakeRunner) Run(cmd string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.log = append(f.log, cmd)
	if f.failOn != "" && strings.Contains(cmd, f.failOn) {
		return "fail", errors.New("induced failure")
	}
	switch {
	case strings.Contains(cmd, "install-service"):
		out := f.installOut
		if out == "" {
			out = "installed release fake-release at /opt/kb-platform/releases/fake-release\n"
		}
		return out, nil
	case strings.Contains(cmd, "kb-create releases"):
		return f.releasesOut, nil
	case strings.Contains(cmd, "manifest.json"):
		id := f.manifestID
		if id == "" {
			id = "gateway"
		}
		return `{"id":"` + id + `"}`, nil
	}
	return "", nil
}

func (f *fakeRunner) RunWithInput(cmd, _ string) (string, error) {
	return f.Run(cmd)
}

// firstIndexOf returns the index of the first log line containing substr, or -1.
func (f *fakeRunner) firstIndexOf(substr string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	for i, l := range f.log {
		if strings.Contains(l, substr) {
			return i
		}
	}
	return -1
}

func (f *fakeRunner) has(substr string) bool { return f.firstIndexOf(substr) >= 0 }

// lastIndexOf returns the index of the last log line containing substr, or -1.
func (f *fakeRunner) lastIndexOf(substr string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	idx := -1
	for i, l := range f.log {
		if strings.Contains(l, substr) {
			idx = i
		}
	}
	return idx
}

func resolverFor(hosts map[string]*fakeRunner) HostResolver {
	return func(name string) (*remote.Host, error) {
		r, ok := hosts[name]
		if !ok {
			return nil, errors.New("unknown host " + name)
		}
		return &remote.Host{Name: name, Runner: r, PlatformPath: "/opt/kb"}, nil
	}
}

func singleServiceCfg() *config.Config {
	return &config.Config{
		Schema: config.CurrentSchema,
		Services: map[string]config.Service{
			"gateway": {
				Service:  "@kb-labs/gateway",
				Version:  "1.2.3",
				Adapters: map[string]string{"llm": "@kb-labs/adapters-openai@0.4.1"},
				Targets:  config.ServiceTargets{Hosts: []string{"h1"}, HealthGate: "5s"},
			},
		},
		Hosts:   map[string]config.Host{"h1": {SSH: config.SSHConfig{Host: "1.1.1.1", User: "kb"}}},
		Rollout: &config.RolloutConfig{AutoRollback: true, Parallel: 1},
	}
}

func TestExecute_SuccessfulInstall(t *testing.T) {
	h1 := &fakeRunner{}
	cfg := singleServiceCfg()
	plan := &Plan{Waves: [][]Action{
		{{
			Kind: ActionInstall, Host: "h1", Service: "gateway",
			ServicePkg: "@kb-labs/gateway", Version: "1.2.3", ToID: "fake-release",
		}},
	}}

	res := Execute(ExecuteOptions{
		Plan:     plan,
		Config:   cfg,
		Resolver: resolverFor(map[string]*fakeRunner{"h1": h1}),
	})
	if res.Err != nil {
		t.Fatalf("unexpected error: %v", res.Err)
	}
	if len(res.Actions) != 1 || !res.Actions[0].Completed {
		t.Errorf("expected 1 completed action: %+v", res.Actions)
	}
	// Commands expected: install-service, swap, restart, ready.
	commands := strings.Join(h1.log, "\n")
	// kb-dev invocations may prepend a --config flag; match the subcommand
	// token explicitly so future flag additions do not break the assertion.
	for _, want := range []string{"install-service", "kb-create swap", "kb-dev", "restart 'gateway'", "ready 'gateway'"} {
		if !strings.Contains(commands, want) {
			t.Errorf("missing command %q in: %s", want, commands)
		}
	}
}

// When the manifest id differs from the package short name (e.g.
// @kb-labs/core-state-daemon → "state-daemon"), restart/health-check must target
// the manifest id, since that is the devservices.yaml key kb-dev resolves.
func TestExecute_RestartsByManifestIDNotShortName(t *testing.T) {
	h1 := &fakeRunner{manifestID: "state-daemon"}
	cfg := &config.Config{
		Schema: config.CurrentSchema,
		Services: map[string]config.Service{
			"state": {
				Service: "@kb-labs/core-state-daemon",
				Version: "2.94.0",
				Targets: config.ServiceTargets{Hosts: []string{"h1"}, HealthGate: "5s"},
			},
		},
		Hosts:   map[string]config.Host{"h1": {SSH: config.SSHConfig{Host: "1.1.1.1", User: "kb"}}},
		Rollout: &config.RolloutConfig{AutoRollback: true, Parallel: 1},
	}
	plan := &Plan{Waves: [][]Action{{{
		Kind: ActionInstall, Host: "h1", Service: "state",
		ServicePkg: "@kb-labs/core-state-daemon", Version: "2.94.0", ToID: "fake-release",
	}}}}

	res := Execute(ExecuteOptions{Plan: plan, Config: cfg, Resolver: resolverFor(map[string]*fakeRunner{"h1": h1})})
	if res.Err != nil {
		t.Fatalf("unexpected error: %v", res.Err)
	}
	commands := strings.Join(h1.log, "\n")
	if !strings.Contains(commands, "restart 'state-daemon'") || !strings.Contains(commands, "ready 'state-daemon'") {
		t.Errorf("expected restart/ready by manifest id 'state-daemon', got: %s", commands)
	}
	if strings.Contains(commands, "restart 'core-state-daemon'") {
		t.Errorf("restart used the package short name instead of the manifest id: %s", commands)
	}
}

func TestExecute_HealthGateFailureTriggersAutoRollback(t *testing.T) {
	h1 := &fakeRunner{failOn: "ready '"}
	cfg := singleServiceCfg()
	plan := &Plan{Waves: [][]Action{
		{{
			Kind: ActionInstall, Host: "h1", Service: "gateway",
			ServicePkg: "@kb-labs/gateway", Version: "1.2.3",
		}},
	}}

	res := Execute(ExecuteOptions{
		Plan:     plan,
		Config:   cfg,
		Resolver: resolverFor(map[string]*fakeRunner{"h1": h1}),
	})
	if res.Err == nil {
		t.Fatal("expected error when health gate fails")
	}
	// Health gate failure means the install action did not reach Completed — rollback skips it.
	// Validate the error is recorded and no rollback was attempted.
	if len(res.Actions) != 1 || res.Actions[0].Err == nil {
		t.Errorf("expected recorded failed action: %+v", res.Actions)
	}
	if len(res.RolledBack) != 0 {
		t.Errorf("expected no rollback for incomplete action, got %+v", res.RolledBack)
	}
}

// A failed wave must produce a structured *diag.Diag (ERR_WAVE_FAILED) whose
// meta carries every per-action failure — not an opaque "wave N failed" string.
func TestExecute_WaveFailureIsStructuredDiag(t *testing.T) {
	h1 := &fakeRunner{failOn: "ready '"}
	cfg := singleServiceCfg()
	plan := &Plan{Waves: [][]Action{{{
		Kind: ActionInstall, Host: "h1", Service: "gateway",
		ServicePkg: "@kb-labs/gateway", Version: "1.2.3",
	}}}}

	res := Execute(ExecuteOptions{
		Plan: plan, Config: cfg,
		Resolver: resolverFor(map[string]*fakeRunner{"h1": h1}),
	})

	var d *diag.Diag
	if !errors.As(res.Err, &d) {
		t.Fatalf("res.Err is not a *diag.Diag: %T", res.Err)
	}
	if d.Code != "ERR_WAVE_FAILED" {
		t.Errorf("code = %q, want ERR_WAVE_FAILED", d.Code)
	}
	if d.Reason == "" {
		t.Error("expected a reason summarizing the failures")
	}
	failures, ok := d.Meta["failures"].([]map[string]any)
	if !ok || len(failures) != 1 {
		t.Fatalf("meta.failures = %v, want one failure", d.Meta["failures"])
	}
	if failures[0]["service"] != "gateway" || failures[0]["host"] != "h1" {
		t.Errorf("failure = %v", failures[0])
	}
}

func TestExecute_MultiHostRollbackOnOneFailure(t *testing.T) {
	// Two hosts in one wave. h1 succeeds, h2 fails at the restart step AFTER
	// the service was swapped successfully. Auto-rollback should roll h1 back.

	// We need h2 to succeed through install+swap but fail on ready, then we
	// expect Execute to still call rollback on h1 (which completed fully).
	//
	// With the current implementation, an action is "Completed" only after
	// restart+health passes. So h2 won't be marked Completed; rollback skips it.
	// h1 completes fully → gets rolled back on wave failure.

	h1 := &fakeRunner{}
	h2 := &fakeRunner{failOn: "ready '"}

	cfg := singleServiceCfg()
	svc := cfg.Services["gateway"]
	svc.Targets.Hosts = []string{"h1", "h2"}
	cfg.Services["gateway"] = svc
	cfg.Hosts["h2"] = config.Host{SSH: config.SSHConfig{Host: "2.2.2.2", User: "kb"}}
	cfg.Rollout.Parallel = 2

	plan := &Plan{Waves: [][]Action{{
		{Kind: ActionInstall, Host: "h1", Service: "gateway", ServicePkg: "@kb-labs/gateway", Version: "1.2.3"},
		{Kind: ActionInstall, Host: "h2", Service: "gateway", ServicePkg: "@kb-labs/gateway", Version: "1.2.3"},
	}}}

	res := Execute(ExecuteOptions{
		Plan:     plan,
		Config:   cfg,
		Resolver: resolverFor(map[string]*fakeRunner{"h1": h1, "h2": h2}),
	})
	if res.Err == nil {
		t.Fatal("expected wave error")
	}
	// Exactly one host should have rolled back: h1.
	if len(res.RolledBack) != 1 || res.RolledBack[0].Action.Host != "h1" {
		t.Errorf("expected rollback of h1, got %+v", res.RolledBack)
	}
	// h1 command history must include kb-create rollback.
	found := false
	for _, c := range h1.log {
		if strings.Contains(c, "kb-create rollback") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("rollback command not executed on h1: %v", h1.log)
	}
}

func TestExecute_SkipDoesNothingRemotely(t *testing.T) {
	h1 := &fakeRunner{}
	cfg := singleServiceCfg()
	plan := &Plan{Waves: [][]Action{{
		{Kind: ActionSkip, Host: "h1", Service: "gateway", ServicePkg: "@kb-labs/gateway", Version: "1.2.3"},
	}}}

	res := Execute(ExecuteOptions{
		Plan:     plan,
		Config:   cfg,
		Resolver: resolverFor(map[string]*fakeRunner{"h1": h1}),
	})
	if res.Err != nil {
		t.Fatalf("unexpected: %v", res.Err)
	}
	if len(h1.log) != 0 {
		t.Errorf("skip should issue no commands, got %v", h1.log)
	}
}

func TestExecute_ConfigDeliveredBeforeInstall(t *testing.T) {
	h1 := &fakeRunner{}
	cfg := singleServiceCfg()
	plan := &Plan{Waves: [][]Action{{
		{Kind: ActionInstall, Host: "h1", Service: "gateway", ServicePkg: "@kb-labs/gateway", Version: "1.2.3"},
	}}}

	res := Execute(ExecuteOptions{
		Plan:     plan,
		Config:   cfg,
		Resolver: resolverFor(map[string]*fakeRunner{"h1": h1}),
		Configs:  map[string]HostConfig{"h1": {JSONC: `{"x":1}`, Env: "K=v\n", Hash: "h-new"}},
	})
	if res.Err != nil {
		t.Fatalf("unexpected: %v", res.Err)
	}
	iSwapCfg := h1.firstIndexOf("mv -f '/opt/kb/.kb/kb.config.jsonc.tmp'")
	iInstall := h1.firstIndexOf("install-service")
	if iSwapCfg < 0 {
		t.Fatalf("config not delivered: %v", h1.log)
	}
	if !(iSwapCfg < iInstall) {
		t.Errorf("config must be delivered before install: cfgSwap=%d install=%d\n%v", iSwapCfg, iInstall, h1.log)
	}
}

func TestExecute_ConfigOnlyChangeForcesRestart(t *testing.T) {
	h1 := &fakeRunner{}
	cfg := singleServiceCfg()
	// Release unchanged → planner emits a skip.
	plan := &Plan{Waves: [][]Action{{
		{Kind: ActionSkip, Host: "h1", Service: "gateway", ServicePkg: "@kb-labs/gateway", Version: "1.2.3", ToID: "rel-1"},
	}}}

	res := Execute(ExecuteOptions{
		Plan:           plan,
		Config:         cfg,
		Resolver:       resolverFor(map[string]*fakeRunner{"h1": h1}),
		Configs:        map[string]HostConfig{"h1": {JSONC: `{"x":1}`, Hash: "h-new"}},
		PrevConfigHash: map[string]string{"h1": "h-old"}, // changed
	})
	if res.Err != nil {
		t.Fatalf("unexpected: %v", res.Err)
	}
	if !h1.has("restart 'gateway'") || !h1.has("ready 'gateway'") {
		t.Errorf("config-only change must force restart through health gate: %v", h1.log)
	}
	if h1.has("install-service") {
		t.Errorf("config-only change must NOT reinstall: %v", h1.log)
	}
}

func TestExecute_UnchangedConfigNoForceRestart(t *testing.T) {
	h1 := &fakeRunner{}
	cfg := singleServiceCfg()
	plan := &Plan{Waves: [][]Action{{
		{Kind: ActionSkip, Host: "h1", Service: "gateway", ServicePkg: "@kb-labs/gateway", Version: "1.2.3", ToID: "rel-1"},
	}}}

	res := Execute(ExecuteOptions{
		Plan:           plan,
		Config:         cfg,
		Resolver:       resolverFor(map[string]*fakeRunner{"h1": h1}),
		Configs:        map[string]HostConfig{"h1": {JSONC: `{"x":1}`, Hash: "h-same"}},
		PrevConfigHash: map[string]string{"h1": "h-same"}, // unchanged
	})
	if res.Err != nil {
		t.Fatalf("unexpected: %v", res.Err)
	}
	if h1.has("restart 'gateway'") {
		t.Errorf("unchanged config must not force restart: %v", h1.log)
	}
}

func TestExecute_ConfigDeliveryFailureAbortsBeforeInstall(t *testing.T) {
	h1 := &fakeRunner{}
	h2 := &fakeRunner{failOn: "test -s"} // tmp verification fails on h2
	cfg := singleServiceCfg()
	svc := cfg.Services["gateway"]
	svc.Targets.Hosts = []string{"h1", "h2"}
	cfg.Services["gateway"] = svc
	cfg.Hosts["h2"] = config.Host{SSH: config.SSHConfig{Host: "2.2.2.2", User: "kb"}}

	plan := &Plan{Waves: [][]Action{{
		{Kind: ActionInstall, Host: "h1", Service: "gateway", ServicePkg: "@kb-labs/gateway", Version: "1.2.3"},
		{Kind: ActionInstall, Host: "h2", Service: "gateway", ServicePkg: "@kb-labs/gateway", Version: "1.2.3"},
	}}}

	res := Execute(ExecuteOptions{
		Plan:     plan,
		Config:   cfg,
		Resolver: resolverFor(map[string]*fakeRunner{"h1": h1, "h2": h2}),
		Configs: map[string]HostConfig{
			"h1": {JSONC: `{"x":1}`, Hash: "a"},
			"h2": {JSONC: `{"x":2}`, Hash: "b"},
		},
	})
	if res.Err == nil {
		t.Fatal("expected error when config delivery fails")
	}
	// The abort must carry a structured diagnostic (ERR_CONFIG_DELIVERY with the
	// failing host in meta), not degrade to a bare ERR_UNKNOWN. The exit-code
	// mapping for the code lives in the cmd package (registered there).
	var d *diag.Diag
	if !errors.As(res.Err, &d) {
		t.Fatalf("config-delivery abort is not a *diag.Diag: %T", res.Err)
	}
	if d.Code != "ERR_CONFIG_DELIVERY" {
		t.Errorf("code = %q, want ERR_CONFIG_DELIVERY", d.Code)
	}
	if d.Meta["host"] == nil {
		t.Errorf("expected meta.host on the delivery diagnostic, got %v", d.Meta)
	}
	if h1.has("install-service") || h2.has("install-service") {
		t.Errorf("no host may install when delivery aborts: h1=%v h2=%v", h1.log, h2.log)
	}
	// h1 was delivered first → must be restored.
	if !h1.has("kb.config.jsonc.prev") {
		t.Errorf("delivered host h1 must be restored on abort: %v", h1.log)
	}
}

func TestExecute_ConfigRestoredBeforeRollbackRestart(t *testing.T) {
	// h1 completes fully; h2 fails at health gate. Wave fails → h1 is rolled
	// back. Because h1's config changed, its previous config must be restored
	// BEFORE the rollback restart, or the old release comes up on new config.
	h1 := &fakeRunner{}
	h2 := &fakeRunner{failOn: "ready '"}
	cfg := singleServiceCfg()
	svc := cfg.Services["gateway"]
	svc.Targets.Hosts = []string{"h1", "h2"}
	cfg.Services["gateway"] = svc
	cfg.Hosts["h2"] = config.Host{SSH: config.SSHConfig{Host: "2.2.2.2", User: "kb"}}
	cfg.Rollout.Parallel = 2

	plan := &Plan{Waves: [][]Action{{
		{Kind: ActionInstall, Host: "h1", Service: "gateway", ServicePkg: "@kb-labs/gateway", Version: "1.2.3"},
		{Kind: ActionInstall, Host: "h2", Service: "gateway", ServicePkg: "@kb-labs/gateway", Version: "1.2.3"},
	}}}

	res := Execute(ExecuteOptions{
		Plan:           plan,
		Config:         cfg,
		Resolver:       resolverFor(map[string]*fakeRunner{"h1": h1, "h2": h2}),
		Configs:        map[string]HostConfig{"h1": {JSONC: `{"x":1}`, Hash: "new"}, "h2": {JSONC: `{"x":2}`, Hash: "new2"}},
		PrevConfigHash: map[string]string{"h1": "old", "h2": "old2"},
	})
	if res.Err == nil {
		t.Fatal("expected wave failure")
	}
	iRestore := h1.firstIndexOf("mv -f '/opt/kb/.kb/kb.config.jsonc.prev'")
	iRollbackRestart := h1.lastIndexOf("restart 'gateway'")
	if iRestore < 0 {
		t.Fatalf("config not restored on h1: %v", h1.log)
	}
	if !(iRestore < iRollbackRestart) {
		t.Errorf("config restore must precede rollback restart: restore=%d restart=%d\n%v",
			iRestore, iRollbackRestart, h1.log)
	}
}

// TestExecute_RollbackRestoresConfigWhenHashUnchanged covers M1: a freshly
// installed host whose config hash happens to equal the lock's (forceRestart
// false) must STILL have its config restored on rollback — otherwise the
// reverted release comes up on the newly delivered config.
func TestExecute_RollbackRestoresConfigWhenHashUnchanged(t *testing.T) {
	h1 := &fakeRunner{}
	h2 := &fakeRunner{failOn: "ready '"}
	cfg := singleServiceCfg()
	svc := cfg.Services["gateway"]
	svc.Targets.Hosts = []string{"h1", "h2"}
	cfg.Services["gateway"] = svc
	cfg.Hosts["h2"] = config.Host{SSH: config.SSHConfig{Host: "2.2.2.2", User: "kb"}}
	cfg.Rollout.Parallel = 2

	plan := &Plan{Waves: [][]Action{{
		{Kind: ActionInstall, Host: "h1", Service: "gateway", ServicePkg: "@kb-labs/gateway", Version: "1.2.3"},
		{Kind: ActionInstall, Host: "h2", Service: "gateway", ServicePkg: "@kb-labs/gateway", Version: "1.2.3"},
	}}}

	res := Execute(ExecuteOptions{
		Plan:     plan,
		Config:   cfg,
		Resolver: resolverFor(map[string]*fakeRunner{"h1": h1, "h2": h2}),
		// h1's hash equals the lock → forceRestart is false for h1, but config
		// was still delivered, so rollback must restore it.
		Configs:        map[string]HostConfig{"h1": {JSONC: `{"x":1}`, Hash: "same"}, "h2": {JSONC: `{"x":2}`, Hash: "new2"}},
		PrevConfigHash: map[string]string{"h1": "same", "h2": "old2"},
	})
	if res.Err == nil {
		t.Fatal("expected wave failure")
	}
	iRestore := h1.firstIndexOf("mv -f '/opt/kb/.kb/kb.config.jsonc.prev'")
	iRollbackRestart := h1.lastIndexOf("restart 'gateway'")
	if iRestore < 0 {
		t.Fatalf("config must be restored on h1 even with unchanged hash: %v", h1.log)
	}
	if !(iRestore < iRollbackRestart) {
		t.Errorf("config restore must precede rollback restart: restore=%d restart=%d\n%v",
			iRestore, iRollbackRestart, h1.log)
	}
}

// TestExecute_ConfigOnlyRestartFailureRestoresConfig covers M2: when a
// config-only change (skip + forceRestart) fails its restart, the wave fails
// and the host must have its config rolled back to .prev and be restarted to
// recover the previously-healthy state — not left down on the bad config.
func TestExecute_ConfigOnlyRestartFailureRestoresConfig(t *testing.T) {
	h1 := &fakeRunner{failOn: "ready '"}
	cfg := singleServiceCfg() // AutoRollback true, single host

	plan := &Plan{Waves: [][]Action{{
		{Kind: ActionSkip, Host: "h1", Service: "gateway", ToID: "rel-current"},
	}}}

	res := Execute(ExecuteOptions{
		Plan:           plan,
		Config:         cfg,
		Resolver:       resolverFor(map[string]*fakeRunner{"h1": h1}),
		Configs:        map[string]HostConfig{"h1": {JSONC: `{"x":1}`, Hash: "new"}},
		PrevConfigHash: map[string]string{"h1": "old"}, // changed → force restart
	})
	if res.Err == nil {
		t.Fatal("expected wave failure from config-only restart")
	}
	iRestore := h1.firstIndexOf("mv -f '/opt/kb/.kb/kb.config.jsonc.prev'")
	if iRestore < 0 {
		t.Fatalf("config must be restored after a failed config-only restart: %v", h1.log)
	}
	// A recovery restart must be attempted after the config is restored.
	if h1.lastIndexOf("restart 'gateway'") <= iRestore {
		t.Errorf("expected a recovery restart after config restore: %v", h1.log)
	}
	// The release must NOT be rolled back — nothing was swapped.
	if h1.has("kb-create rollback") {
		t.Errorf("config-only change must not trigger a release rollback: %v", h1.log)
	}
}

func TestParseHealthGate(t *testing.T) {
	if d := parseHealthGate(""); d.String() != "30s" {
		t.Errorf("empty → %s", d)
	}
	if d := parseHealthGate("10s"); d.String() != "10s" {
		t.Errorf("10s → %s", d)
	}
	if d := parseHealthGate("garbage"); d.String() != "30s" {
		t.Errorf("garbage falls back to default")
	}
}

func TestServiceShortName(t *testing.T) {
	if serviceShortName("@kb-labs/gateway") != "gateway" {
		t.Error("gateway")
	}
	if serviceShortName("plain") != "plain" {
		t.Error("plain")
	}
}
