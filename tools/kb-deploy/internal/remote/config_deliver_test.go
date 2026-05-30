package remote

import (
	"errors"
	"strings"
	"testing"
)

// inputRunner records both Run and RunWithInput calls in one ordered log and
// can be told to fail a specific command substring (to simulate an empty tmp
// file failing `test -s`).
type inputRunner struct {
	log     []string // each entry: "RUN <cmd>" or "INPUT <cmd> <<< <data>"
	failOn  string   // substring; Run/RunWithInput returns err when cmd contains it
	failErr error
}

func (r *inputRunner) Run(cmd string) (string, error) {
	r.log = append(r.log, "RUN "+cmd)
	if r.failOn != "" && strings.Contains(cmd, r.failOn) {
		return "", r.failErr
	}
	return "", nil
}

func (r *inputRunner) RunWithInput(cmd, input string) (string, error) {
	r.log = append(r.log, "INPUT "+cmd+" <<< "+input)
	if r.failOn != "" && strings.Contains(cmd, r.failOn) {
		return "", r.failErr
	}
	return "", nil
}

// indexOf returns the first log index whose entry contains substr, or -1.
func indexOf(log []string, substr string) int {
	for i, l := range log {
		if strings.Contains(l, substr) {
			return i
		}
	}
	return -1
}

func TestDeliverConfig_AtomicWriteOrder(t *testing.T) {
	r := &inputRunner{}
	h := &Host{Name: "p1", Runner: r, PlatformPath: "/opt/kb-platform"}

	jsonc := `{"adapters":{"llm":"openai"}}`
	env := "MONGODB_URI=mongodb://x\n"
	if err := h.DeliverConfig(jsonc, env); err != nil {
		t.Fatalf("DeliverConfig: %v", err)
	}

	// mkdir is first.
	if i := indexOf(r.log, "mkdir -p"); i != 0 {
		t.Fatalf("mkdir not first: %v", r.log)
	}
	if !strings.Contains(r.log[0], "/opt/kb-platform/.kb") {
		t.Errorf("mkdir target wrong: %q", r.log[0])
	}

	// For the config file: backup → write tmp via stdin → test -s → mv.
	iBackup := indexOf(r.log, "kb.config.jsonc.prev")
	iWrite := indexOf(r.log, "INPUT")
	iTest := indexOf(r.log, "test -s")
	iSwap := indexOf(r.log, "mv -f")
	if !(iBackup < iWrite && iWrite < iTest && iTest < iSwap) {
		t.Fatalf("order backup<write<test<swap not satisfied: backup=%d write=%d test=%d swap=%d\n%v",
			iBackup, iWrite, iTest, iSwap, r.log)
	}

	// Content is delivered verbatim over stdin, not in argv.
	writeLine := r.log[iWrite]
	if !strings.Contains(writeLine, "umask 077") {
		t.Errorf("write must set umask 077: %q", writeLine)
	}
	if !strings.Contains(writeLine, jsonc) {
		t.Errorf("jsonc content missing from stdin: %q", writeLine)
	}
	for _, l := range r.log {
		if strings.HasPrefix(l, "RUN ") && strings.Contains(l, jsonc) {
			t.Errorf("secret/config content leaked into argv: %q", l)
		}
	}

	// .env is also delivered (non-empty).
	if indexOf(r.log, "/opt/kb-platform/.kb/.env.tmp") < 0 {
		t.Errorf(".env not delivered: %v", r.log)
	}
}

func TestDeliverConfig_EmptyTmpAborts(t *testing.T) {
	// `test -s` fails (tmp empty / truncated) → no swap, working config intact.
	r := &inputRunner{failOn: "test -s", failErr: errors.New("exit 1")}
	h := &Host{Name: "p1", Runner: r, PlatformPath: "/opt/kb-platform"}

	err := h.DeliverConfig(`{"x":1}`, "")
	if err == nil {
		t.Fatal("expected error when tmp verification fails")
	}
	if indexOf(r.log, "mv -f") >= 0 {
		t.Errorf("must NOT swap when tmp verification fails: %v", r.log)
	}
}

func TestDeliverConfig_SkipsEnvWhenEmpty(t *testing.T) {
	r := &inputRunner{}
	h := &Host{Name: "p1", Runner: r, PlatformPath: "/opt/kb-platform"}
	if err := h.DeliverConfig(`{"x":1}`, ""); err != nil {
		t.Fatalf("DeliverConfig: %v", err)
	}
	if indexOf(r.log, ".env.tmp") >= 0 {
		t.Errorf("empty env should not be written: %v", r.log)
	}
}

func TestRestoreConfig_MovesPrevBack(t *testing.T) {
	r := &inputRunner{}
	h := &Host{Name: "p1", Runner: r, PlatformPath: "/opt/kb-platform"}
	if err := h.RestoreConfig(); err != nil {
		t.Fatalf("RestoreConfig: %v", err)
	}
	if indexOf(r.log, "mv -f '/opt/kb-platform/.kb/kb.config.jsonc.prev'") < 0 {
		t.Errorf("restore must move .prev back: %v", r.log)
	}
}

// TestRestoreConfig_GuardsWithTestF asserts restore is guarded by `test -f`
// so a missing backup is a clean no-op while a present-but-unmovable backup
// surfaces a real error (L2) — it must NOT swallow failures with `|| true`.
func TestRestoreConfig_GuardsWithTestF(t *testing.T) {
	r := &inputRunner{}
	h := &Host{Name: "p1", Runner: r, PlatformPath: "/opt/kb-platform"}
	if err := h.RestoreConfig(); err != nil {
		t.Fatalf("RestoreConfig: %v", err)
	}
	for _, l := range r.log {
		if strings.Contains(l, "kb.config.jsonc.prev") {
			if !strings.Contains(l, "test -f") {
				t.Errorf("restore must guard with test -f: %q", l)
			}
			if strings.Contains(l, "2>/dev/null") || strings.Contains(l, "|| true") {
				t.Errorf("restore must not swallow real failures: %q", l)
			}
		}
	}
}

// TestRestoreConfig_SurfacesMoveFailure asserts a failing restore move (e.g.
// permissions on a present backup) is propagated, not swallowed.
func TestRestoreConfig_SurfacesMoveFailure(t *testing.T) {
	r := &inputRunner{failOn: "kb.config.jsonc.prev", failErr: errors.New("permission denied")}
	h := &Host{Name: "p1", Runner: r, PlatformPath: "/opt/kb-platform"}
	if err := h.RestoreConfig(); err == nil {
		t.Fatal("expected restore failure to surface")
	}
}

// TestDeliverConfig_EmptyEnvClearsStaleBackup covers M4: when this apply has no
// env, DeliverConfig must drop any stale .env.prev so a later RestoreConfig
// cannot resurrect a .env from an earlier apply.
func TestDeliverConfig_EmptyEnvClearsStaleBackup(t *testing.T) {
	r := &inputRunner{}
	h := &Host{Name: "p1", Runner: r, PlatformPath: "/opt/kb-platform"}
	if err := h.DeliverConfig(`{"x":1}`, ""); err != nil {
		t.Fatalf("DeliverConfig: %v", err)
	}
	if indexOf(r.log, "rm -f '/opt/kb-platform/.kb/.env.prev'") < 0 {
		t.Errorf("empty env must clear stale .env.prev: %v", r.log)
	}
}

// Host must satisfy the ConfigDeliverer seam.
var _ ConfigDeliverer = (*Host)(nil)
