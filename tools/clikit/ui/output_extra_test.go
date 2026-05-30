package ui

import (
	"encoding/json"
	"io"
	"os"
	"strings"
	"testing"
)

// captureStdout redirects os.Stdout for the duration of fn and returns what
// was written. Used to exercise the JSONOut/JSONLOut agent paths, which write
// to os.Stdout directly.
func captureStdout(t *testing.T, fn func()) string {
	t.Helper()
	old := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}
	os.Stdout = w
	defer func() { os.Stdout = old }()

	fn()
	_ = w.Close()
	out, _ := io.ReadAll(r)
	return string(out)
}

func TestJSONOut_WritesIndentedJSON(t *testing.T) {
	out := captureStdout(t, func() {
		if err := JSONOut(map[string]any{"k": "v"}); err != nil {
			t.Errorf("JSONOut error: %v", err)
		}
	})
	// Indented form has a two-space lead before the key.
	if !strings.Contains(out, "\n  \"k\": \"v\"") {
		t.Errorf("JSONOut not indented:\n%q", out)
	}
	var v map[string]any
	if err := json.Unmarshal([]byte(out), &v); err != nil {
		t.Fatalf("JSONOut not valid json: %v", err)
	}
}

func TestJSONLOut_WritesSingleLine(t *testing.T) {
	out := captureStdout(t, func() {
		if err := JSONLOut(map[string]any{"a": 1, "b": 2}); err != nil {
			t.Errorf("JSONLOut error: %v", err)
		}
	})
	if strings.Count(strings.TrimRight(out, "\n"), "\n") != 0 {
		t.Errorf("JSONL must be one line, got:\n%q", out)
	}
	var v map[string]any
	if err := json.Unmarshal([]byte(out), &v); err != nil {
		t.Fatalf("JSONLOut not valid json: %v", err)
	}
}

func TestJSONOut_ErrorOnUnmarshalable(t *testing.T) {
	// A channel cannot be marshaled — JSONOut must surface the error.
	out := captureStdout(t, func() {
		if err := JSONOut(make(chan int)); err == nil {
			t.Error("JSONOut should error on an unmarshalable value")
		}
	})
	_ = out
}

func TestJSONLOut_ErrorOnUnmarshalable(t *testing.T) {
	if err := JSONLOut(make(chan int)); err == nil {
		t.Error("JSONLOut should error on an unmarshalable value")
	}
}

func TestNewStdout_WritesPlain(t *testing.T) {
	out := captureStdout(t, func() {
		NewStdout().Info("hi")
	})
	if out != "[INFO] hi\n" {
		t.Errorf("NewStdout().Info = %q", out)
	}
}

func TestNewStderr_DoesNotPanic(t *testing.T) {
	old := os.Stderr
	_, w, _ := os.Pipe()
	os.Stderr = w
	defer func() { os.Stderr = old; _ = w.Close() }()
	NewStderr().Warn("careful") // must not panic
}

func TestSectionRawBullet(t *testing.T) {
	var b strings.Builder
	o := New(&b)
	o.Section("Services")
	o.Raw("plain line")
	o.Bullet("solo", "") // no-details branch

	got := b.String()
	want := "\n[INFO] Services\n" +
		"plain line\n" +
		"    ● solo\n"
	if got != want {
		t.Errorf("output mismatch:\n got: %q\nwant: %q", got, want)
	}
}
