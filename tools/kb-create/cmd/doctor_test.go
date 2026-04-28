package cmd

import "testing"

// TestFailedChecksExcludesSoft verifies that soft failures are not counted as
// hard failures and therefore do not contribute to the exit-code decision.
func TestFailedChecksExcludesSoft(t *testing.T) {
	checks := []doctorCheck{
		{Name: "node", OK: true},
		{Name: "network", OK: false, Soft: true},
		{Name: "platform", OK: false, Soft: false},
	}

	hard := failedChecks(checks)
	if len(hard) != 1 {
		t.Fatalf("failedChecks() = %d items, want 1", len(hard))
	}
	if hard[0].Name != "platform" {
		t.Errorf("failedChecks()[0].Name = %q, want %q", hard[0].Name, "platform")
	}
}

// TestSoftFailedChecks verifies that softFailedChecks returns only advisory failures.
func TestSoftFailedChecks(t *testing.T) {
	checks := []doctorCheck{
		{Name: "node", OK: true},
		{Name: "network", OK: false, Soft: true},
		{Name: "platform", OK: false, Soft: false},
	}

	soft := softFailedChecks(checks)
	if len(soft) != 1 {
		t.Fatalf("softFailedChecks() = %d items, want 1", len(soft))
	}
	if soft[0].Name != "network" {
		t.Errorf("softFailedChecks()[0].Name = %q, want %q", soft[0].Name, "network")
	}
}

// TestFailedChecksAllPass verifies that an all-pass check set returns nothing.
func TestFailedChecksAllPass(t *testing.T) {
	checks := []doctorCheck{
		{Name: "node", OK: true},
		{Name: "network", OK: true},
	}
	if got := failedChecks(checks); len(got) != 0 {
		t.Errorf("failedChecks() on all-pass = %d items, want 0", len(got))
	}
}

// TestFailedChecksSoftOnlyIsClean verifies that a check set with only soft
// failures has no hard failures — i.e. doctor would exit 0.
func TestFailedChecksSoftOnlyIsClean(t *testing.T) {
	checks := []doctorCheck{
		{Name: "node", OK: true},
		{Name: "network", OK: false, Soft: true},
	}
	if got := failedChecks(checks); len(got) != 0 {
		t.Errorf("failedChecks() with only soft failures = %d hard failures, want 0", len(got))
	}
}
