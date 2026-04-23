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
	fr := &fakeRunner{responses: map[string]string{
		"install-service": "installed release gateway-1.2.3-aaa at /opt/kb-platform/releases/gateway-1.2.3-aaa\n  evicted: gateway-0.9.0-old\n",
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

func TestInstallService_NoOp(t *testing.T) {
	fr := &fakeRunner{responses: map[string]string{
		"install-service": "release gateway-1.2.3-aaa already installed (no-op)\n",
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

func TestInstallService_CommandFailure(t *testing.T) {
	fr := &fakeRunner{err: errors.New("exit status 1")}
	h := &Host{Name: "p1", Runner: fr}
	_, err := h.InstallService(InstallOpts{ServicePkg: "x", Version: "1"})
	if err == nil {
		t.Error("expected error")
	}
}

func TestSwap(t *testing.T) {
	fr := &fakeRunner{}
	h := &Host{Name: "p1", Runner: fr, PlatformPath: "/opt/kb"}
	if err := h.Swap("@kb-labs/gateway", "rel-1"); err != nil {
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
