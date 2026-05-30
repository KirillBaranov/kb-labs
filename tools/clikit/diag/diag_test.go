package diag

import (
	"errors"
	"testing"
)

func TestNew_RegistryHintApplied(t *testing.T) {
	RegisterHints(map[string]string{"ERR_X": "do the thing"})
	d := New("ERR_X", "x happened")
	if d.Hint != "do the thing" {
		t.Errorf("hint = %q, want registry default", d.Hint)
	}
	if d.Error() != "x happened" {
		t.Errorf("Error() = %q", d.Error())
	}
}

func TestNew_ExplicitHintOverridesRegistry(t *testing.T) {
	RegisterHints(map[string]string{"ERR_Y": "registry hint"})
	d := New("ERR_Y", "y", WithHint("explicit hint"), WithReason("because"))
	if d.Hint != "explicit hint" {
		t.Errorf("hint = %q, want explicit", d.Hint)
	}
	if d.Reason != "because" {
		t.Errorf("reason = %q", d.Reason)
	}
}

func TestWrap_UnwrapChain(t *testing.T) {
	cause := errors.New("root cause")
	d := Wrap(cause, "ERR_Z", "z failed", WithMeta(map[string]any{"k": "v"}))
	if !errors.Is(d, cause) {
		t.Error("errors.Is should find the wrapped cause")
	}
	if d.Meta["k"] != "v" {
		t.Errorf("meta = %v", d.Meta)
	}
}

func TestExitCode(t *testing.T) {
	RegisterExitCodes(map[string]int{"ERR_CFG": ExitConfig})
	cases := []struct {
		name string
		d    *Diag
		want int
	}{
		{"nil", nil, ExitOK},
		{"registered", New("ERR_CFG", "bad config"), ExitConfig},
		{"default", New("ERR_OTHER", "boom"), ExitError},
		{"meta override", New("ERR_OTHER", "boom", WithMeta(map[string]any{"exitCode": 3})), ExitForbidden},
	}
	for _, c := range cases {
		if got := ExitCode(c.d); got != c.want {
			t.Errorf("%s: ExitCode = %d, want %d", c.name, got, c.want)
		}
	}
}

func TestDiag_AsError(t *testing.T) {
	var err error = New("ERR_E", "msg")
	var d *Diag
	if !errors.As(err, &d) {
		t.Fatal("errors.As should extract *Diag")
	}
	if d.Code != "ERR_E" {
		t.Errorf("code = %q", d.Code)
	}
}
