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

// TestCheckBinarySoft_MissingBinaryIsSoftFailure guards against a regression
// where `kb-create doctor` exited non-zero on a machine without Docker
// installed, even though Docker is only needed for devservices.yaml entries
// with type: docker — not for the base install/start flow (all default
// manifest services are type: node). buildChecks wires "docker" through
// checkBinarySoft specifically so a missing/failing binary is advisory
// (Soft), not a hard failure of the overall doctor exit code. Probes a
// binary name that cannot exist, so the result doesn't depend on whether
// Docker happens to be installed on the machine running the test.
func TestCheckBinarySoft_MissingBinaryIsSoftFailure(t *testing.T) {
	c := checkBinarySoft("kb-create-doctor-test-nonexistent-binary-xyz", "--version", "hint")
	if c.OK {
		t.Fatal("checkBinarySoft() on a nonexistent binary = OK, want false")
	}
	if !c.Soft {
		t.Error("checkBinarySoft() Soft = false, want true — a missing optional binary must not fail `kb-create doctor`")
	}
}

// TestBuildChecks_DockerWiredThroughSoftPath verifies buildChecks declares
// the "docker" check via checkBinarySoft (not the hard checkBinary), so it
// can never fail the overall doctor exit code regardless of whether Docker
// happens to be installed on the machine running kb-create.
func TestBuildChecks_DockerWiredThroughSoftPath(t *testing.T) {
	checks := buildChecks("")

	var docker *doctorCheck
	for i := range checks {
		if checks[i].Name == "docker" {
			docker = &checks[i]
			break
		}
	}
	if docker == nil {
		t.Fatal("buildChecks() has no \"docker\" check")
	}
	if !docker.OK && !docker.Soft {
		t.Error("docker check failed and Soft = false — missing/broken Docker must not fail `kb-create doctor`")
	}
}
