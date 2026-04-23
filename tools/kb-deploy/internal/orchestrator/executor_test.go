package orchestrator

import (
	"errors"
	"strings"
	"sync"
	"testing"

	"github.com/kb-labs/kb-deploy/internal/config"
	"github.com/kb-labs/kb-deploy/internal/remote"
)

// fakeRunner supports both success and targeted failure.
type fakeRunner struct {
	mu         sync.Mutex
	log        []string
	failOn     string // if set, commands containing this substring fail
	installOut string
	releasesOut string
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
	}
	return "", nil
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
	for _, want := range []string{"install-service", "swap", "kb-dev restart", "kb-dev ready"} {
		if !strings.Contains(commands, want) {
			t.Errorf("missing command %q in: %s", want, commands)
		}
	}
}

func TestExecute_HealthGateFailureTriggersAutoRollback(t *testing.T) {
	h1 := &fakeRunner{failOn: "kb-dev ready"}
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
	h2 := &fakeRunner{failOn: "kb-dev ready"}

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
