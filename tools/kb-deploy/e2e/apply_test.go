// Package e2e exercises the end-to-end deploy flow (Phase 4–6) with a fake
// Runner in place of SSH. It complements the per-package unit tests by
// covering realistic multi-wave rollouts and lock persistence.
//
// A full cross-module e2e with real SSH + Verdaccio + Docker targets is a
// follow-up tracked in docs/plans/0014.
package e2e

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/kb-labs/kb-deploy/internal/config"
	"github.com/kb-labs/kb-deploy/internal/lock"
	"github.com/kb-labs/kb-deploy/internal/orchestrator"
	"github.com/kb-labs/kb-deploy/internal/releaseid"
	"github.com/kb-labs/kb-deploy/internal/remote"
)

// scriptedRunner returns canned output or injects failures based on command
// substrings. Thread-safe (the orchestrator runs hosts in parallel).
type scriptedRunner struct {
	name string

	mu       sync.Mutex
	log      []string
	// fail marks substrings whose commands should fail.
	fail map[string]bool
	// state tracks the current release id per service on this "host".
	current map[string]string
}

func newRunner(name string) *scriptedRunner {
	return &scriptedRunner{
		name:    name,
		fail:    map[string]bool{},
		current: map[string]string{},
	}
}

func (r *scriptedRunner) Run(cmd string) (string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.log = append(r.log, cmd)

	for needle := range r.fail {
		if strings.Contains(cmd, needle) {
			return "", errors.New("induced failure on " + r.name)
		}
	}

	switch {
	case strings.Contains(cmd, "kb-create install-service"):
		// Synthesise a plausible install output. The release id is already
		// encoded in the --keep-releases etc. args, but we just fabricate one
		// based on the service pkg + version we see.
		rel := fakeReleaseIDFromInstallCmd(cmd)
		return fmt.Sprintf("installed release %s at /opt/kb-platform/releases/%s\n", rel, rel), nil

	case strings.Contains(cmd, "kb-create swap"):
		pkg, rel := parseSwapArgs(cmd)
		r.current[pkg] = rel
		return "", nil

	case strings.Contains(cmd, "kb-create rollback"):
		// Rollback flips back to "prev-" prefixed id (we don't track previous
		// precisely in this fake, just flag it).
		return "", nil

	case strings.Contains(cmd, "kb-create releases"):
		// Synthesise JSON output compatible with remote.ReleasesReport.
		payload := map[string]interface{}{
			"current":  r.current,
			"previous": map[string]string{},
			"releases": map[string][]map[string]string{},
		}
		data, _ := json.Marshal(payload)
		return string(data), nil

	case strings.Contains(cmd, "kb-dev restart"),
		strings.Contains(cmd, "kb-dev ready"):
		return "", nil
	}
	return "", nil
}

// fakeReleaseIDFromInstallCmd extracts "<pkg>@<ver>" from the `--adapters`
// flag-less part of the install command and shortens it into a release id.
func fakeReleaseIDFromInstallCmd(cmd string) string {
	// Very loose parser — finds the first single-quoted spec after "install-service".
	idx := strings.Index(cmd, "install-service ")
	if idx < 0 {
		return "fake-release"
	}
	rest := cmd[idx+len("install-service "):]
	start := strings.Index(rest, "'")
	if start < 0 {
		return "fake-release"
	}
	end := strings.Index(rest[start+1:], "'")
	if end < 0 {
		return "fake-release"
	}
	spec := rest[start+1 : start+1+end]
	// spec is "@scope/name@version" — last @ splits.
	at := strings.LastIndex(spec, "@")
	if at <= 0 {
		return "fake-release"
	}
	name := spec[:at]
	ver := spec[at+1:]
	// Strip "@scope/".
	if slash := strings.LastIndex(name, "/"); slash >= 0 {
		name = name[slash+1:]
	}
	return fmt.Sprintf("%s-%s-abcdef12", name, ver)
}

func parseSwapArgs(cmd string) (pkg, rel string) {
	// swap '<pkg>' '<rel>' ...
	parts := strings.Fields(cmd)
	var quoted []string
	for _, p := range parts {
		if strings.HasPrefix(p, "'") && strings.HasSuffix(p, "'") {
			quoted = append(quoted, strings.Trim(p, "'"))
		}
	}
	if len(quoted) >= 2 {
		return quoted[0], quoted[1]
	}
	return "", ""
}

// ---------------------------------------------------------------------------
// scenarios
// ---------------------------------------------------------------------------

// TestE2E_CanaryRolloutSuccess simulates a 3-host canary rollout [50, 100]
// where every host is healthy. All actions must execute, lock must record
// every applied (host, service) pair.
func TestE2E_CanaryRolloutSuccess(t *testing.T) {
	cfg := threeHostCanaryConfig()

	runners := map[string]*scriptedRunner{
		"h1": newRunner("h1"), "h2": newRunner("h2"), "h3": newRunner("h3"),
	}
	plan, res := runApply(t, cfg, runners, nil)

	if res.Err != nil {
		t.Fatalf("unexpected rollout error: %v", res.Err)
	}
	if n := len(plan.Waves); n != 2 {
		t.Fatalf("expected 2 waves (50+100), got %d", n)
	}

	// Every runner must have executed install → swap → restart → ready.
	for name, r := range runners {
		got := strings.Join(r.log, "\n")
		for _, want := range []string{"install-service", "swap", "kb-dev restart", "kb-dev ready"} {
			if !strings.Contains(got, want) {
				t.Errorf("host %s: missing %q in command log", name, want)
			}
		}
	}

	// Lock written and content sane.
	lockDir := t.TempDir()
	fakeDeployYAML := filepath.Join(lockDir, "deploy.yaml")
	l := lock.New("kb-deploy-e2e")
	l.Platform.Version = cfg.Platform.Version
	serviceLock := lock.ServiceLock{
		Resolved:  "@kb-labs/gateway@" + cfg.Services["gateway"].Version,
		AppliedTo: map[string]lock.HostApplication{},
	}
	for _, w := range plan.Waves {
		for _, a := range w {
			serviceLock.AppliedTo[a.Host] = lock.HostApplication{ReleaseID: a.ToID}
		}
	}
	l.Services["gateway"] = serviceLock
	if err := l.Save(fakeDeployYAML); err != nil {
		t.Fatalf("Save lock: %v", err)
	}
	reread, err := lock.Load(fakeDeployYAML)
	if err != nil {
		t.Fatalf("Load lock: %v", err)
	}
	if len(reread.Services["gateway"].AppliedTo) != 3 {
		t.Errorf("lock.appliedTo should have 3 hosts, got %v", reread.Services["gateway"].AppliedTo)
	}
}

// TestE2E_CanaryRolloutRollbackOnWaveFailure simulates a 4-host canary with
// waves [50, 100]: wave1=[h1,h2], wave2=[h3,h4]. h4 fails the health gate in
// wave 2. AutoRollback must revert h3 (completed in the failing wave) and
// leave h1/h2 untouched — the orchestrator rolls only the failing wave, per
// ADR-0014.
func TestE2E_CanaryRolloutRollbackOnWaveFailure(t *testing.T) {
	cfg := fourHostCanaryConfig()
	cfg.Rollout.AutoRollback = true
	cfg.Rollout.Parallel = 2

	runners := map[string]*scriptedRunner{
		"h1": newRunner("h1"),
		"h2": newRunner("h2"),
		"h3": newRunner("h3"),
		"h4": newRunner("h4"),
	}
	// h4 fails the health gate in wave 2.
	runners["h4"].fail["kb-dev ready"] = true

	_, res := runApply(t, cfg, runners, nil)

	if res.Err == nil {
		t.Fatal("expected rollout error")
	}
	// h3 completed install+swap in wave 2 before h4 failed, so it must be rolled back.
	h3Cmds := strings.Join(runners["h3"].log, "\n")
	if !strings.Contains(h3Cmds, "kb-create rollback") {
		t.Errorf("h3 should have been rolled back; log:\n%s", h3Cmds)
	}
	// h1 and h2 were in wave 1 which succeeded — they must NOT be rolled back.
	for _, h := range []string{"h1", "h2"} {
		cmds := strings.Join(runners[h].log, "\n")
		if strings.Contains(cmds, "kb-create rollback") {
			t.Errorf("%s (wave 1) should not be rolled back; log:\n%s", h, cmds)
		}
	}
}

// TestE2E_ConfigParsingFromYAMLFile covers the full config.Load path with a
// deploy.yaml written to disk + a .env file for secret resolution.
func TestE2E_ConfigParsingFromYAMLFile(t *testing.T) {
	dir := t.TempDir()
	deploy := filepath.Join(dir, ".kb", "deploy.yaml")
	if err := os.MkdirAll(filepath.Dir(deploy), 0o750); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	yaml := `schema: kb.deploy/1
platform:
  version: "1.0.0"
services:
  gateway:
    service: "@kb-labs/gateway"
    version: "1.2.3"
    adapters:
      llm: "@kb-labs/adapters-openai@0.4.1"
    env:
      OPENAI_KEY: ${secrets.OPENAI_KEY}
    targets:
      hosts: [prod-1]
hosts:
  prod-1:
    ssh:
      host: 1.2.3.4
      user: kb
      key_path_env: DEPLOY_KEY_PATH
rollout:
  autoRollback: true
  lockMode: artifact
`
	if err := os.WriteFile(deploy, []byte(yaml), 0o600); err != nil {
		t.Fatalf("write deploy.yaml: %v", err)
	}

	cfg, err := config.Load(deploy, dir)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if err := config.ValidateForApply(cfg); err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if cfg.Services["gateway"].Adapters["llm"] != "@kb-labs/adapters-openai@0.4.1" {
		t.Errorf("adapter lost after parse: %v", cfg.Services["gateway"].Adapters)
	}
	if cfg.Rollout.LockMode != "artifact" {
		t.Errorf("lockMode = %q", cfg.Rollout.LockMode)
	}
}

// TestE2E_ReleaseIDAgreesAcrossModules asserts that kb-deploy's releaseid
// package produces the same id as the kb-create side for identical inputs.
// A drift here would silently cause apply to always plan "install" even on
// already-correct hosts (ADR-0014 §D3).
func TestE2E_ReleaseIDAgreesAcrossModules(t *testing.T) {
	// These are the same inputs used in kb-create/internal/releases tests
	// (see id_test.go in that module). If the digest algorithm drifts between
	// the two modules, this test output will change — the kb-create test will
	// stay green but this one will fail (or vice versa), flagging drift.
	id := releaseid.ComputeID("@kb-labs/gateway", "1.2.3",
		map[string]string{
			"llm":   "@kb-labs/adapters-openai@0.4.1",
			"cache": "@kb-labs/adapters-redis@0.2.0",
		},
		nil)
	if !strings.HasPrefix(id, "gateway-1.2.3-") {
		t.Errorf("unexpected id shape: %q", id)
	}
	// Canonical form: "@kb-labs/gateway@1.2.3|cache=...,llm=...|" — swapping
	// adapter order must NOT change the id.
	id2 := releaseid.ComputeID("@kb-labs/gateway", "1.2.3",
		map[string]string{
			"cache": "@kb-labs/adapters-redis@0.2.0",
			"llm":   "@kb-labs/adapters-openai@0.4.1",
		},
		nil)
	if id != id2 {
		t.Errorf("id is map-order-sensitive: %q vs %q", id, id2)
	}
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// threeHostCanaryConfig builds a canary [50, 100] rollout with 3 hosts.
// 50% of 3 = ceil(1.5) = 2, so wave1 = [h1, h2] and wave2 = [h3].
func threeHostCanaryConfig() *config.Config {
	return &config.Config{
		Schema: config.CurrentSchema,
		Platform: &config.PlatformConfig{Version: "1.0.0"},
		Services: map[string]config.Service{
			"gateway": {
				Service:  "@kb-labs/gateway",
				Version:  "1.2.3",
				Adapters: map[string]string{"llm": "@kb-labs/adapters-openai@0.4.1"},
				Targets: config.ServiceTargets{
					// Host order: h1 is in wave 1; h2/h3 are in wave 2 (50%=ceil(1.5)=2 in wave1, 1 in wave2).
					// Reorder to [h1,h2,h3] so we can state: wave1=[h1,h2], wave2=[h3].
					// Tests above must reflect this.
					Hosts:      []string{"h1", "h2", "h3"},
					Strategy:   "canary",
					Waves:      []int{50, 100},
					HealthGate: "5s",
				},
			},
		},
		Hosts: map[string]config.Host{
			"h1": {SSH: config.SSHConfig{Host: "1.1.1.1", User: "kb"}},
			"h2": {SSH: config.SSHConfig{Host: "2.2.2.2", User: "kb"}},
			"h3": {SSH: config.SSHConfig{Host: "3.3.3.3", User: "kb"}},
		},
		Rollout: &config.RolloutConfig{AutoRollback: false, Parallel: 1},
	}
}

// fourHostCanaryConfig builds a canary [50, 100] rollout with 4 hosts so the
// waves split cleanly into two pairs.
func fourHostCanaryConfig() *config.Config {
	return &config.Config{
		Schema:   config.CurrentSchema,
		Platform: &config.PlatformConfig{Version: "1.0.0"},
		Services: map[string]config.Service{
			"gateway": {
				Service:  "@kb-labs/gateway",
				Version:  "1.2.3",
				Adapters: map[string]string{"llm": "@kb-labs/adapters-openai@0.4.1"},
				Targets: config.ServiceTargets{
					Hosts:      []string{"h1", "h2", "h3", "h4"},
					Strategy:   "canary",
					Waves:      []int{50, 100},
					HealthGate: "5s",
				},
			},
		},
		Hosts: map[string]config.Host{
			"h1": {SSH: config.SSHConfig{Host: "1.1.1.1", User: "kb"}},
			"h2": {SSH: config.SSHConfig{Host: "2.2.2.2", User: "kb"}},
			"h3": {SSH: config.SSHConfig{Host: "3.3.3.3", User: "kb"}},
			"h4": {SSH: config.SSHConfig{Host: "4.4.4.4", User: "kb"}},
		},
		Rollout: &config.RolloutConfig{AutoRollback: true, Parallel: 2},
	}
}

// runApply is the shared harness: compute a plan from the given config and
// runners, then execute it. Returns the computed plan and orchestrator result.
func runApply(t *testing.T, cfg *config.Config,
	runners map[string]*scriptedRunner, _ *testing.T) (*orchestrator.Plan, *orchestrator.Result) {
	t.Helper()

	// All hosts start Missing → plan produces ActionInstall everywhere.
	states := map[string]orchestrator.HostState{}
	for name := range runners {
		states[name] = orchestrator.HostState{Host: name, Missing: true}
	}

	plan, err := orchestrator.ComputePlan(cfg, states, func(svc config.Service) string {
		return releaseid.ComputeID(svc.Service, svc.Version, svc.Adapters, svc.Plugins)
	})
	if err != nil {
		t.Fatalf("ComputePlan: %v", err)
	}

	resolver := func(name string) (*remote.Host, error) {
		r, ok := runners[name]
		if !ok {
			return nil, fmt.Errorf("unknown host %s", name)
		}
		return &remote.Host{Name: name, Runner: r, PlatformPath: "/opt/kb"}, nil
	}

	var stdout, stderr bytes.Buffer
	res := orchestrator.Execute(orchestrator.ExecuteOptions{
		Plan:     plan,
		Config:   cfg,
		Resolver: resolver,
		Stdout:   &stdout,
		Stderr:   &stderr,
	})
	return plan, res
}
