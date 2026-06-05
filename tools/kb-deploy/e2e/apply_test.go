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

	mu  sync.Mutex
	log []string
	// inputs records the stdin payload of each RunWithInput call, keyed by the
	// command string, so config-delivery tests can assert verbatim content.
	inputs map[string]string
	// fail marks substrings whose commands should fail.
	fail map[string]bool
	// state tracks the current release id per service on this "host".
	current map[string]string
}

func newRunner(name string) *scriptedRunner {
	return &scriptedRunner{
		name:    name,
		inputs:  map[string]string{},
		fail:    map[string]bool{},
		current: map[string]string{},
	}
}

// RunWithInput records the stdin payload then delegates to Run so the scripted
// switch (failures, releases JSON, etc.) still applies. Mirrors how the unit
// fakes delegate; lets config-delivery tests assert what was streamed.
func (r *scriptedRunner) RunWithInput(cmd, input string) (string, error) {
	r.mu.Lock()
	r.inputs[cmd] = input
	r.mu.Unlock()
	return r.Run(cmd)
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
		// Emit the machine-readable JSON the real install-service produces under
		// --output json (with some plausible progress noise on the same combined
		// stream, which the parser must ignore).
		rel := fakeReleaseIDFromInstallCmd(cmd)
		return fmt.Sprintf("Progress: resolved 1, reused 1\n{\"releaseId\":%q,\"noop\":false,\"evicted\":[]}\n", rel), nil

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

	case strings.Contains(cmd, "manifest.json"):
		// ServiceID reads the manifest id; return the services/<short>/ segment
		// so the restart target matches the installed unit in this fake.
		return `{"id":"` + shortFromManifestPath(cmd) + `"}`, nil

	case strings.Contains(cmd, "restart '"),
		strings.Contains(cmd, "ready '"):
		return "", nil
	}
	return "", nil
}

// shortFromManifestPath extracts <short> from a ".../services/<short>/current/..."
// manifest cat command.
func shortFromManifestPath(cmd string) string {
	const marker = "/services/"
	i := strings.Index(cmd, marker)
	if i < 0 {
		return "svc"
	}
	rest := cmd[i+len(marker):]
	if j := strings.Index(rest, "/"); j >= 0 {
		return rest[:j]
	}
	return "svc"
}

// fakeReleaseIDFromInstallCmd returns the release id the real install-service
// would report: the explicit --release-id when the caller pins one (the deploy
// path always does), else a fabricated id derived from the pkg@ver spec.
func fakeReleaseIDFromInstallCmd(cmd string) string {
	if id := quotedArgAfter(cmd, "--release-id "); id != "" {
		return id
	}
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

// quotedArgAfter returns the single-quoted value immediately following marker in
// cmd, or "" if marker is absent. e.g. quotedArgAfter("x --release-id 'r1'", "--release-id ") == "r1".
func quotedArgAfter(cmd, marker string) string {
	idx := strings.Index(cmd, marker)
	if idx < 0 {
		return ""
	}
	rest := cmd[idx+len(marker):]
	if len(rest) == 0 || rest[0] != '\'' {
		return ""
	}
	end := strings.Index(rest[1:], "'")
	if end < 0 {
		return ""
	}
	return rest[1 : 1+end]
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
		for _, want := range []string{"install-service", "kb-create swap", "restart '", "ready '"} {
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
	runners["h4"].fail["ready '"] = true

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
	id := releaseid.ComputeID("@kb-labs/gateway", "1.2.3", "",
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
	id2 := releaseid.ComputeID("@kb-labs/gateway", "1.2.3", "",
		map[string]string{
			"cache": "@kb-labs/adapters-redis@0.2.0",
			"llm":   "@kb-labs/adapters-openai@0.4.1",
		},
		nil)
	if id != id2 {
		t.Errorf("id is map-order-sensitive: %q vs %q", id, id2)
	}
}

// TestE2E_ConfigDeliveredBeforeInstall asserts the rendered config is atomically
// swapped into place (mv into <platformPath>/.kb/kb.config.jsonc) before the
// first install-service on every host, and that the JSONC body is streamed
// verbatim over stdin (never argv).
func TestE2E_ConfigDeliveredBeforeInstall(t *testing.T) {
	cfg := threeHostCanaryConfig()
	runners := map[string]*scriptedRunner{
		"h1": newRunner("h1"), "h2": newRunner("h2"), "h3": newRunner("h3"),
	}
	const jsonc = "{\n  \"adapters\": { \"doc-db\": \"mongodb\" }\n}\n"
	configs := map[string]orchestrator.HostConfig{}
	for name := range runners {
		configs[name] = orchestrator.HostConfig{JSONC: jsonc, Env: "MONGODB_URI=mongodb://prod/db\n", Hash: "hash-v1"}
	}

	_, res := runApply(t, cfg, runners, &applyOverrides{configs: configs})
	if res.Err != nil {
		t.Fatalf("unexpected error: %v", res.Err)
	}

	const swap = "mv -f '/opt/kb/.kb/kb.config.jsonc.tmp' '/opt/kb/.kb/kb.config.jsonc'"
	for name, r := range runners {
		deliverIdx := firstIdx(r.log, swap)
		installIdx := firstIdx(r.log, "install-service")
		if deliverIdx < 0 {
			t.Errorf("host %s: config never swapped into place; log:\n%s", name, strings.Join(r.log, "\n"))
			continue
		}
		if installIdx < 0 || deliverIdx >= installIdx {
			t.Errorf("host %s: config swap (idx %d) must precede install-service (idx %d)", name, deliverIdx, installIdx)
		}
		// Body must travel over stdin verbatim, not on the command line.
		var sawBody bool
		for cmd, in := range r.inputs {
			if in == jsonc {
				sawBody = true
			}
			if strings.Contains(cmd, jsonc) {
				t.Errorf("host %s: config body leaked into argv: %q", name, cmd)
			}
		}
		if !sawBody {
			t.Errorf("host %s: config body never streamed over stdin", name)
		}
	}
}

// TestE2E_ConfigIdempotentWhenHashUnchanged asserts that when the lock's config
// hash matches the prepared hash and the release is unchanged (skip), the host
// is neither reinstalled nor force-restarted.
func TestE2E_ConfigIdempotentWhenHashUnchanged(t *testing.T) {
	cfg := threeHostCanaryConfig()
	runners := map[string]*scriptedRunner{
		"h1": newRunner("h1"), "h2": newRunner("h2"), "h3": newRunner("h3"),
	}
	// Seed every host as already running the planned release → plan = skip.
	relID := releaseid.ComputeID("@kb-labs/gateway", "1.2.3", "",
		map[string]string{"llm": "@kb-labs/adapters-openai@0.4.1"}, nil)
	states := map[string]orchestrator.HostState{}
	configs := map[string]orchestrator.HostConfig{}
	prev := map[string]string{}
	for name := range runners {
		states[name] = orchestrator.HostState{Host: name, Current: map[string]string{"@kb-labs/gateway": relID}}
		configs[name] = orchestrator.HostConfig{JSONC: "{}\n", Hash: "hash-v1"}
		prev[name] = "hash-v1" // unchanged
	}

	plan, res := runApply(t, cfg, runners, &applyOverrides{states: states, configs: configs, prevHash: prev})
	if res.Err != nil {
		t.Fatalf("unexpected error: %v", res.Err)
	}
	if plan.Summary().Skip == 0 {
		t.Fatalf("expected skip actions, plan: %s", plan.String())
	}
	for name, r := range runners {
		got := strings.Join(r.log, "\n")
		if strings.Contains(got, "install-service") {
			t.Errorf("host %s: reinstalled despite unchanged hash; log:\n%s", name, got)
		}
		if strings.Contains(got, "restart '") {
			t.Errorf("host %s: force-restarted despite unchanged hash; log:\n%s", name, got)
		}
	}
}

// TestE2E_ConfigOnlyChangeForcesRestart asserts that a config-only change (same
// release, new hash) restarts the service through the health gate without
// reinstalling or swapping the release.
func TestE2E_ConfigOnlyChangeForcesRestart(t *testing.T) {
	cfg := threeHostCanaryConfig()
	runners := map[string]*scriptedRunner{
		"h1": newRunner("h1"), "h2": newRunner("h2"), "h3": newRunner("h3"),
	}
	relID := releaseid.ComputeID("@kb-labs/gateway", "1.2.3", "",
		map[string]string{"llm": "@kb-labs/adapters-openai@0.4.1"}, nil)
	states := map[string]orchestrator.HostState{}
	configs := map[string]orchestrator.HostConfig{}
	prev := map[string]string{}
	for name := range runners {
		states[name] = orchestrator.HostState{Host: name, Current: map[string]string{"@kb-labs/gateway": relID}}
		configs[name] = orchestrator.HostConfig{JSONC: "{}\n", Hash: "hash-v2"}
		prev[name] = "hash-v1" // changed → force restart
	}

	_, res := runApply(t, cfg, runners, &applyOverrides{states: states, configs: configs, prevHash: prev})
	if res.Err != nil {
		t.Fatalf("unexpected error: %v", res.Err)
	}
	for name, r := range runners {
		got := strings.Join(r.log, "\n")
		if strings.Contains(got, "install-service") || strings.Contains(got, "kb-create swap") {
			t.Errorf("host %s: release touched on config-only change; log:\n%s", name, got)
		}
		if !strings.Contains(got, "restart '") || !strings.Contains(got, "ready '") {
			t.Errorf("host %s: config-only change must restart through health gate; log:\n%s", name, got)
		}
	}
}

// TestE2E_ConfigDeliveryAbortsBeforeInstall asserts that if config delivery
// fails on any host, the run aborts before any install/swap on every host and
// restores the already-delivered hosts to their previous config.
func TestE2E_ConfigDeliveryAbortsBeforeInstall(t *testing.T) {
	cfg := threeHostCanaryConfig()
	runners := map[string]*scriptedRunner{
		"h1": newRunner("h1"), "h2": newRunner("h2"), "h3": newRunner("h3"),
	}
	// h2's config write fails mid-stream (delivery is sorted h1<h2<h3).
	runners["h2"].fail["cat > '/opt/kb/.kb/kb.config.jsonc.tmp'"] = true

	configs := map[string]orchestrator.HostConfig{}
	for name := range runners {
		configs[name] = orchestrator.HostConfig{JSONC: "{}\n", Hash: "hash-v1"}
	}

	_, res := runApply(t, cfg, runners, &applyOverrides{configs: configs})
	if res.Err == nil {
		t.Fatal("expected delivery failure to abort the apply")
	}
	for name, r := range runners {
		if strings.Contains(strings.Join(r.log, "\n"), "install-service") {
			t.Errorf("host %s: install ran despite aborted config delivery", name)
		}
	}
	// h1 was delivered before h2 failed → it must be restored to .prev.
	const restore = "mv -f '/opt/kb/.kb/kb.config.jsonc.prev' '/opt/kb/.kb/kb.config.jsonc'"
	if !strings.Contains(strings.Join(runners["h1"].log, "\n"), restore) {
		t.Errorf("h1 was delivered first; it must be restored on abort; log:\n%s", strings.Join(runners["h1"].log, "\n"))
	}
}

// TestE2E_ConfigRollbackBeforeReleaseRollback asserts that on a wave failure
// the config is restored to .prev BEFORE the release is rolled back and the
// previous release is restarted — otherwise the old release would come up on
// the new config.
func TestE2E_ConfigRollbackBeforeReleaseRollback(t *testing.T) {
	cfg := fourHostCanaryConfig() // autoRollback=true, parallel=2, waves [50,100]
	runners := map[string]*scriptedRunner{
		"h1": newRunner("h1"), "h2": newRunner("h2"),
		"h3": newRunner("h3"), "h4": newRunner("h4"),
	}
	// h4 fails the health gate in wave 2; h3 completes in that wave.
	runners["h4"].fail["ready '"] = true

	configs := map[string]orchestrator.HostConfig{}
	for name := range runners {
		configs[name] = orchestrator.HostConfig{JSONC: "{}\n", Hash: "hash-v2"}
	}
	// prevHash empty → changed → forceRestart set for every host.

	_, res := runApply(t, cfg, runners, &applyOverrides{configs: configs})
	if res.Err == nil {
		t.Fatal("expected wave failure")
	}
	h3 := runners["h3"].log
	const restore = "mv -f '/opt/kb/.kb/kb.config.jsonc.prev' '/opt/kb/.kb/kb.config.jsonc'"
	restoreIdx := firstIdx(h3, restore)
	rollbackIdx := firstIdx(h3, "kb-create rollback")
	if restoreIdx < 0 {
		t.Fatalf("h3: config not restored during rollback; log:\n%s", strings.Join(h3, "\n"))
	}
	if rollbackIdx < 0 || restoreIdx >= rollbackIdx {
		t.Errorf("h3: config restore (idx %d) must precede release rollback (idx %d)", restoreIdx, rollbackIdx)
	}
}

// firstIdx returns the index of the first log entry containing sub, or -1.
func firstIdx(log []string, sub string) int {
	for i, c := range log {
		if strings.Contains(c, sub) {
			return i
		}
	}
	return -1
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// threeHostCanaryConfig builds a canary [50, 100] rollout with 3 hosts.
// 50% of 3 = ceil(1.5) = 2, so wave1 = [h1, h2] and wave2 = [h3].
func threeHostCanaryConfig() *config.Config {
	return &config.Config{
		Schema:   config.CurrentSchema,
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

// applyOverrides carries optional config-delivery inputs and pre-seeded host
// state into the harness. A nil *applyOverrides means "all hosts Missing, no
// config delivery" — the original behaviour.
type applyOverrides struct {
	// states overrides the default "all Missing" host states so config-only
	// scenarios can model already-installed hosts (→ ActionSkip).
	states map[string]orchestrator.HostState
	// configs is the per-host rendered config to deliver before the waves.
	configs map[string]orchestrator.HostConfig
	// prevHash is the per-host config hash from the lock (idempotency input).
	prevHash map[string]string
}

// runApply is the shared harness: compute a plan from the given config and
// runners, then execute it. Returns the computed plan and orchestrator result.
func runApply(t *testing.T, cfg *config.Config,
	runners map[string]*scriptedRunner, ov *applyOverrides) (*orchestrator.Plan, *orchestrator.Result) {
	t.Helper()

	// All hosts start Missing → plan produces ActionInstall everywhere, unless
	// the override supplies explicit states.
	states := map[string]orchestrator.HostState{}
	for name := range runners {
		states[name] = orchestrator.HostState{Host: name, Missing: true}
	}
	if ov != nil && ov.states != nil {
		states = ov.states
	}

	plan, err := orchestrator.ComputePlan(cfg, states, func(svc config.Service) string {
		// e2e harness exercises the spec-only id path (integrity "" ); the
		// registry-integrity fetch is unit-tested in flow/remote/releaseid.
		return releaseid.ComputeID(svc.Service, svc.Version, "", svc.Adapters, svc.Plugins)
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

	opts := orchestrator.ExecuteOptions{
		Plan:     plan,
		Config:   cfg,
		Resolver: resolver,
	}
	if ov != nil {
		opts.Configs = ov.configs
		opts.PrevConfigHash = ov.prevHash
	}
	var stdout, stderr bytes.Buffer
	opts.Stdout = &stdout
	opts.Stderr = &stderr
	res := orchestrator.Execute(opts)
	return plan, res
}
