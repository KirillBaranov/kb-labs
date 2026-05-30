package ui

import (
	"bytes"
	"strings"
	"testing"
)

// With a non-terminal writer (bytes.Buffer) color is disabled, so output is
// deterministic regardless of environment — a stable golden.
func TestOutput_PlainNoColor(t *testing.T) {
	var b bytes.Buffer
	o := New(&b)
	o.Info("starting")
	o.OK("done")
	o.Warn("careful")
	o.Err("boom")
	o.KeyValue("host", "vm-1")
	o.Bullet("svc", "ok")
	o.Detail("extra")

	got := b.String()
	want := "[INFO] starting\n" +
		"[ OK ] done\n" +
		"[WARN] careful\n" +
		"[ERR ] boom\n" +
		"  host: vm-1\n" +
		"    ● svc                             ok\n" +
		"    ↳ extra\n"
	if got != want {
		t.Errorf("output mismatch:\n got: %q\nwant: %q", got, want)
	}
}

func TestColorEnabled_BufferIsFalse(t *testing.T) {
	if ColorEnabled(&bytes.Buffer{}) {
		t.Error("a non-file writer must not enable color")
	}
}

func TestPad(t *testing.T) {
	if got := Pad("x", 4); got != "x   " {
		t.Errorf("Pad = %q", got)
	}
	if strings.TrimRight(Pad("abc", 2), " ") != "abc" {
		t.Error("Pad must not truncate")
	}
}
