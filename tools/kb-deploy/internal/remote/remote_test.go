package remote

import (
	"errors"
	"strings"
	"testing"
)

// fakeRunner records commands and returns canned responses.
type fakeRunner struct {
	log       []string
	responses map[string]string // substring → output
	err       error
}

func (f *fakeRunner) Run(cmd string) (string, error) {
	f.log = append(f.log, cmd)
	if f.err != nil {
		return "", f.err
	}
	for substr, out := range f.responses {
		if strings.Contains(cmd, substr) {
			return out, nil
		}
	}
	return "", nil
}

func (f *fakeRunner) RunWithInput(cmd, _ string) (string, error) {
	return f.Run(cmd)
}

func TestServiceID_ReadsManifestID(t *testing.T) {
	fr := &fakeRunner{responses: map[string]string{
		"manifest.json": `{"schema":"kb.service/1","id":"state-daemon","runtime":{"entry":"dist/bin.cjs"}}`,
	}}
	h := &Host{Name: "p1", Runner: fr, PlatformPath: "/opt/kb"}

	id, err := h.ServiceID("@kb-labs/core-state-daemon", "core-state-daemon")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if id != "state-daemon" {
		t.Errorf("id = %q, want state-daemon (manifest id, not short name)", id)
	}
	want := "/opt/kb/services/core-state-daemon/current/node_modules/@kb-labs/core-state-daemon/dist/manifest.json"
	if len(fr.log) == 0 || !strings.Contains(fr.log[0], want) {
		t.Errorf("manifest path = %v, want it to contain %q", fr.log, want)
	}
}

func TestServiceID_EmptyIDIsError(t *testing.T) {
	fr := &fakeRunner{responses: map[string]string{"manifest.json": `{"id":""}`}}
	h := &Host{Name: "p1", Runner: fr, PlatformPath: "/opt/kb"}
	if _, err := h.ServiceID("@kb-labs/gateway-app", "gateway-app"); err == nil {
		t.Fatal("expected error for empty manifest id")
	}
}

func TestServiceID_BadJSONIsError(t *testing.T) {
	fr := &fakeRunner{responses: map[string]string{"manifest.json": "not json"}}
	h := &Host{Name: "p1", Runner: fr, PlatformPath: "/opt/kb"}
	if _, err := h.ServiceID("@kb-labs/gateway-app", "gateway-app"); err == nil {
		t.Fatal("expected error for malformed manifest json")
	}
}

func TestShellQuote(t *testing.T) {
	if got := shellQuote("simple"); got != "'simple'" {
		t.Errorf("got %q", got)
	}
	if got := shellQuote("with 'quote' inside"); got != `'with '\''quote'\'' inside'` {
		t.Errorf("got %q", got)
	}
}

func TestBuildInstallCmd_AllOptions(t *testing.T) {
	h := &Host{Name: "p1", PlatformPath: "/opt/kb-platform"}
	cmd := h.buildInstallCmd(InstallOpts{
		ServicePkg:   "@kb-labs/gateway",
		Version:      "1.2.3",
		Adapters:     map[string]string{"llm": "@kb-labs/adapters-openai@0.4.1"},
		Plugins:      map[string]string{"@kb-labs/marketplace": "1.0.0"},
		Registry:     "https://npm.internal",
		KeepReleases: 5,
	})
	must := []string{
		"kb-create install-service",
		"'@kb-labs/gateway@1.2.3'",
		"--output json",
		"--platform '/opt/kb-platform'",
		"--registry 'https://npm.internal'",
		"--keep-releases 5",
		"--adapters 'llm=@kb-labs/adapters-openai@0.4.1'",
		"--plugins '@kb-labs/marketplace@1.0.0'",
	}
	for _, m := range must {
		if !strings.Contains(cmd, m) {
			t.Errorf("missing %q in: %s", m, cmd)
		}
	}
}

func TestInstallService_SuccessPath(t *testing.T) {
	// Realistic combined stdout+stderr: pnpm progress (stderr) interleaved with
	// the single JSON object (stdout). Parser must pick the JSON, not a prose line.
	fr := &fakeRunner{responses: map[string]string{
		"install-service": "Progress: resolved 120, downloaded 40\n" +
			"dependencies added\n" +
			`{"releaseId":"gateway-1.2.3-aaa","noop":false,"evicted":["gateway-0.9.0-old"]}` + "\n",
	}}
	h := &Host{Name: "p1", Runner: fr}
	res, err := h.InstallService(InstallOpts{ServicePkg: "@kb-labs/gateway", Version: "1.2.3"})
	if err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	if res.ReleaseID != "gateway-1.2.3-aaa" {
		t.Errorf("ReleaseID = %q", res.ReleaseID)
	}
	if res.NoOp {
		t.Error("NoOp should be false")
	}
	if len(res.Evicted) != 1 || res.Evicted[0] != "gateway-0.9.0-old" {
		t.Errorf("Evicted = %v", res.Evicted)
	}
}

// TestInstallService_GluedPrefix reproduces the SSH stream-merge failure where a
// trailing stderr fragment with no newline is glued onto the JSON line, e.g.
// `npm warn deprecated …{"releaseId":…}`. The parser must still recover the id.
func TestInstallService_GluedPrefix(t *testing.T) {
	fr := &fakeRunner{responses: map[string]string{
		"install-service": `npm warn deprecated node-domexception@1.0.0{"releaseId":"gateway-1.2.3-aaa","noop":false,"evicted":[]}` + "\n",
	}}
	h := &Host{Name: "p1", Runner: fr}
	res, err := h.InstallService(InstallOpts{ServicePkg: "@kb-labs/gateway", Version: "1.2.3"})
	if err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	if res.ReleaseID != "gateway-1.2.3-aaa" {
		t.Errorf("ReleaseID = %q", res.ReleaseID)
	}
}

func TestInstallService_NoOp(t *testing.T) {
	fr := &fakeRunner{responses: map[string]string{
		"install-service": `{"releaseId":"gateway-1.2.3-aaa","noop":true,"evicted":[]}` + "\n",
	}}
	h := &Host{Runner: fr}
	res, err := h.InstallService(InstallOpts{ServicePkg: "@kb-labs/gateway", Version: "1.2.3"})
	if err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	if !res.NoOp {
		t.Error("expected NoOp")
	}
	if res.ReleaseID != "gateway-1.2.3-aaa" {
		t.Errorf("ReleaseID = %q", res.ReleaseID)
	}
}

// TestInstallService_NoReleaseID guards the bug where empty stdout (or output
// with no JSON result) silently yielded an empty release-id that then broke Swap.
// It must now be a hard error.
func TestInstallService_NoReleaseID(t *testing.T) {
	for name, out := range map[string]string{
		"empty":           "",
		"only progress":   "Progress: resolved 10\ndone\n",
		"json without id": `{"noop":false,"evicted":[]}` + "\n",
		"json empty id":   `{"releaseId":"","noop":false,"evicted":[]}` + "\n",
	} {
		t.Run(name, func(t *testing.T) {
			fr := &fakeRunner{responses: map[string]string{"install-service": out}}
			h := &Host{Name: "p1", Runner: fr}
			_, err := h.InstallService(InstallOpts{ServicePkg: "@kb-labs/gateway", Version: "1.2.3"})
			if err == nil {
				t.Fatal("expected ERR_INSTALL_NO_RELEASE_ID")
			}
			if !strings.Contains(err.Error(), "ERR_INSTALL_NO_RELEASE_ID") {
				t.Errorf("error = %v, want ERR_INSTALL_NO_RELEASE_ID", err)
			}
		})
	}
}

func TestInstallService_CommandFailure(t *testing.T) {
	fr := &fakeRunner{err: errors.New("exit status 1")}
	h := &Host{Name: "p1", Runner: fr}
	_, err := h.InstallService(InstallOpts{ServicePkg: "x", Version: "1"})
	if err == nil {
		t.Error("expected error")
	}
}

func TestPackageIntegrity_Success(t *testing.T) {
	fr := &fakeRunner{responses: map[string]string{
		"npm view": "sha512-AbCdEf==\n",
	}}
	h := &Host{Name: "p1", Runner: fr, PlatformPath: "/opt/kb"}
	got, err := h.PackageIntegrity("@kb-labs/gateway-app", "2.94.0", "http://127.0.0.1:4873")
	if err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	if got != "sha512-AbCdEf==" {
		t.Errorf("integrity = %q", got)
	}
	if len(fr.log) == 0 || !strings.Contains(fr.log[0], "--registry 'http://127.0.0.1:4873'") {
		t.Errorf("registry not passed: %v", fr.log)
	}
}

func TestPackageIntegrity_EmptyIsError(t *testing.T) {
	fr := &fakeRunner{responses: map[string]string{"npm view": "\n"}}
	h := &Host{Name: "p1", Runner: fr}
	_, err := h.PackageIntegrity("@kb-labs/gateway-app", "2.94.0", "http://127.0.0.1:4873")
	if err == nil || !strings.Contains(err.Error(), "ERR_REGISTRY_INTEGRITY") {
		t.Fatalf("want ERR_REGISTRY_INTEGRITY, got %v", err)
	}
}

func TestSwap(t *testing.T) {
	fr := &fakeRunner{}
	h := &Host{Name: "p1", Runner: fr, PlatformPath: "/opt/kb"}
	if err := h.Swap("@kb-labs/gateway", "rel-1", nil); err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	if len(fr.log) != 1 {
		t.Fatalf("expected 1 command, got %v", fr.log)
	}
	want := "kb-create swap '@kb-labs/gateway' 'rel-1' --platform '/opt/kb'"
	if fr.log[0] != want {
		t.Errorf("got %q\nwant %q", fr.log[0], want)
	}
}

func TestSwap_WithEnvOverrides(t *testing.T) {
	fr := &fakeRunner{}
	h := &Host{Name: "p1", Runner: fr, PlatformPath: "/opt/kb"}
	if err := h.Swap("@kb-labs/studio-app", "rel-1",
		map[string]string{"PORT": "3002", "HOST": "127.0.0.1"}); err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	// Env flags are sorted for a stable command.
	want := "kb-create swap '@kb-labs/studio-app' 'rel-1' --platform '/opt/kb'" +
		" --env 'HOST=127.0.0.1' --env 'PORT=3002'"
	if fr.log[0] != want {
		t.Errorf("got %q\nwant %q", fr.log[0], want)
	}
}

func TestRollback(t *testing.T) {
	fr := &fakeRunner{}
	h := &Host{Name: "p1", Runner: fr}
	if err := h.Rollback("@kb-labs/gateway"); err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	if !strings.Contains(fr.log[0], "kb-create rollback '@kb-labs/gateway'") {
		t.Errorf("unexpected command: %s", fr.log[0])
	}
}

func TestCurrentReleases_ParsesJSON(t *testing.T) {
	fr := &fakeRunner{responses: map[string]string{
		"kb-create releases": `{
  "current": {"@kb-labs/gateway": "gateway-1.2.3-aaa"},
  "previous": {"@kb-labs/gateway": "gateway-1.2.2-bbb"},
  "releases": {
    "@kb-labs/gateway": [
      {"id": "gateway-1.2.3-aaa", "version": "1.2.3", "createdAt": "2026-04-22T10:00:00Z"}
    ]
  }
}`,
	}}
	h := &Host{Name: "p1", Runner: fr}
	rep, err := h.CurrentReleases()
	if err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	if rep.Current["@kb-labs/gateway"] != "gateway-1.2.3-aaa" {
		t.Errorf("Current = %v", rep.Current)
	}
	if len(rep.Releases["@kb-labs/gateway"]) != 1 {
		t.Errorf("Releases = %v", rep.Releases)
	}
}

func TestRestartAndWaitHealthy_RunsBothCommands(t *testing.T) {
	fr := &fakeRunner{}
	h := &Host{Name: "p1", Runner: fr}
	if err := h.RestartAndWaitHealthy("gateway", 30*1e9); err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	if len(fr.log) != 2 {
		t.Fatalf("expected 2 commands, got %d: %v", len(fr.log), fr.log)
	}
	if !strings.Contains(fr.log[0], "kb-dev restart 'gateway'") {
		t.Errorf("first = %q", fr.log[0])
	}
	if !strings.Contains(fr.log[1], "kb-dev ready 'gateway'") ||
		!strings.Contains(fr.log[1], "--timeout") {
		t.Errorf("second = %q", fr.log[1])
	}
}
