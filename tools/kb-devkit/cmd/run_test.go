package cmd

import (
	"strings"
	"testing"
)

// TestFailureTailShowsAssertionAtEnd is the regression test for the devkit
// runner output fix: a failed test task's stderr starts with setup noise (log
// lines) while the actual assertion is printed to STDOUT at the END. The old
// behaviour printed the FIRST lines of stderr only, hiding the real failure.
// failureTail must surface the tail of the combined streams instead.
func TestFailureTailShowsAssertionAtEnd(t *testing.T) {
	stderr := "[ERROR] Skipped manifest patch\n[WARN] cache miss\n[INFO] booting runner"
	stdout := "RUN src/foo.test.ts\n× foo > bar\n  → expected 4 to be 5"

	lines, hidden := failureTail(stdout, stderr, 50)
	joined := strings.Join(lines, "\n")

	if !strings.Contains(joined, "expected 4 to be 5") {
		t.Errorf("tail must contain the assertion; got:\n%s", joined)
	}
	if hidden != 0 {
		t.Errorf("hidden = %d, want 0 (everything fits in 50 lines)", hidden)
	}
	// stdout must come before stderr so the runner summary leads.
	if i, j := strings.Index(joined, "× foo > bar"), strings.Index(joined, "[ERROR]"); i == -1 || j == -1 || i > j {
		t.Errorf("stdout should precede stderr; got:\n%s", joined)
	}
}

// TestFailureTailTruncatesToLimit verifies that only the last `limit` lines are
// returned and `hidden` reports the count dropped from the top.
func TestFailureTailTruncatesToLimit(t *testing.T) {
	var b strings.Builder
	for i := 1; i <= 100; i++ {
		b.WriteString("line")
		b.WriteByte('\n')
	}
	// 100 identical lines; make the last one distinguishable.
	stdout := b.String() + "FINAL-ASSERTION"

	lines, hidden := failureTail(stdout, "", 10)
	if len(lines) != 10 {
		t.Fatalf("len(lines) = %d, want 10", len(lines))
	}
	if lines[len(lines)-1] != "FINAL-ASSERTION" {
		t.Errorf("last line = %q, want FINAL-ASSERTION", lines[len(lines)-1])
	}
	if hidden != 91 { // 101 total lines - 10 shown
		t.Errorf("hidden = %d, want 91", hidden)
	}
}

// TestFailureTailUnlimited verifies limit <= 0 returns everything with nothing hidden.
func TestFailureTailUnlimited(t *testing.T) {
	stdout := "a\nb\nc\nd\ne"
	lines, hidden := failureTail(stdout, "", 0)
	if len(lines) != 5 || hidden != 0 {
		t.Errorf("got %d lines, hidden=%d; want 5 lines, hidden=0", len(lines), hidden)
	}
}

// TestFailureTailEmpty verifies empty input yields no lines.
func TestFailureTailEmpty(t *testing.T) {
	lines, hidden := failureTail("", "", 50)
	if len(lines) != 0 || hidden != 0 {
		t.Errorf("got %d lines, hidden=%d; want 0,0", len(lines), hidden)
	}
}
