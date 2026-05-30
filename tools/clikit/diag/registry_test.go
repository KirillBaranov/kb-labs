package diag

import "testing"

func TestHintFor_UnknownCodeIsEmpty(t *testing.T) {
	if got := HintFor("ERR_DEFINITELY_NOT_REGISTERED"); got != "" {
		t.Errorf("HintFor(unknown) = %q, want empty", got)
	}
}

func TestRegisterHints_LastWriteWins(t *testing.T) {
	RegisterHints(map[string]string{"ERR_DUP": "first"})
	RegisterHints(map[string]string{"ERR_DUP": "second"})
	if got := HintFor("ERR_DUP"); got != "second" {
		t.Errorf("HintFor after re-register = %q, want %q", got, "second")
	}
}

func TestExitCode_NilIsOK(t *testing.T) {
	if got := ExitCode(nil); got != ExitOK {
		t.Errorf("ExitCode(nil) = %d, want %d", got, ExitOK)
	}
}

func TestExitCode_MetaOverridesRegistry(t *testing.T) {
	// Registered code says config-failure, but an explicit Meta.exitCode wins.
	RegisterExitCodes(map[string]int{"ERR_PRECEDENCE": ExitConfig})
	d := New("ERR_PRECEDENCE", "boom", WithMeta(map[string]any{"exitCode": ExitForbidden}))
	if got := ExitCode(d); got != ExitForbidden {
		t.Errorf("ExitCode = %d, want meta override %d", got, ExitForbidden)
	}
}

func TestExitCode_RegistryUsedWhenNoMeta(t *testing.T) {
	RegisterExitCodes(map[string]int{"ERR_REG_ONLY": ExitConfig})
	if got := ExitCode(New("ERR_REG_ONLY", "x")); got != ExitConfig {
		t.Errorf("ExitCode = %d, want %d", got, ExitConfig)
	}
}

func TestExitCode_DefaultsToExitError(t *testing.T) {
	if got := ExitCode(New("ERR_NO_MAPPING_AT_ALL", "x")); got != ExitError {
		t.Errorf("ExitCode = %d, want default %d", got, ExitError)
	}
}

// toInt is the bridge for Meta["exitCode"] arriving as int / int64 / float64
// (e.g. after a JSON round-trip) — each must resolve, anything else falls
// through to the registry / default.
func TestExitCode_MetaIntKinds(t *testing.T) {
	cases := []struct {
		name string
		val  any
		want int
	}{
		{"int", int(2), 2},
		{"int64", int64(3), 3},
		{"float64 (post-JSON)", float64(2), 2},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			d := New("ERR_META_KIND", "x", WithMeta(map[string]any{"exitCode": c.val}))
			if got := ExitCode(d); got != c.want {
				t.Errorf("ExitCode = %d, want %d", got, c.want)
			}
		})
	}
}

func TestExitCode_MetaNonIntFallsThrough(t *testing.T) {
	// A non-numeric exitCode is ignored; the registered/default code applies.
	RegisterExitCodes(map[string]int{"ERR_BAD_META": ExitConfig})
	d := New("ERR_BAD_META", "x", WithMeta(map[string]any{"exitCode": "not-a-number"}))
	if got := ExitCode(d); got != ExitConfig {
		t.Errorf("ExitCode = %d, want registry %d (bad meta ignored)", got, ExitConfig)
	}
}
