package diag

import (
	"errors"
	"testing"
)

// A nil *Diag must never panic on the error-interface methods — it can reach
// them through a typed-nil error value.
func TestNilDiag_ErrorAndUnwrapAreSafe(t *testing.T) {
	var d *Diag
	if d.Error() != "" {
		t.Errorf("nil.Error() = %q, want empty", d.Error())
	}
	if d.Unwrap() != nil {
		t.Error("nil.Unwrap() should be nil")
	}
}

func TestWithMeta_MergesIntoExisting(t *testing.T) {
	d := New("ERR_MERGE", "x",
		WithMeta(map[string]any{"a": 1}),
		WithMeta(map[string]any{"b": 2}),
	)
	if d.Meta["a"] != 1 || d.Meta["b"] != 2 {
		t.Errorf("meta = %v, want both keys merged", d.Meta)
	}
}

func TestWrap_PreservesCauseAndIsChain(t *testing.T) {
	sentinel := errors.New("disk full")
	d := Wrap(sentinel, "ERR_WRITE", "could not write")
	if !errors.Is(d, sentinel) {
		t.Error("errors.Is must find the wrapped sentinel")
	}
	if d.Unwrap() != sentinel {
		t.Error("Unwrap must return the original cause")
	}
}
