package cmd

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

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

// ── checkBinariesAgainst: catches the exact 2026-08-12 /tmp symlink-rot incident ──

// symlinkOrSkip creates a symlink and skips the test on platforms/filesystems
// where symlink creation isn't permitted (matches installer.CopyBinary's own
// fallback-to-copy behavior, which checkBinariesAgainst explicitly treats as
// an accepted, undetectable-staleness limitation — see its doc comment).
func symlinkOrSkip(t *testing.T, target, link string) {
	t.Helper()
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("symlink not supported in this environment: %v", err)
	}
}

func TestCheckBinariesAgainstAllHealthy(t *testing.T) {
	platformDir := t.TempDir()
	binDir := filepath.Join(platformDir, "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}
	realBinary := filepath.Join(binDir, "kb-dev")
	if err := os.WriteFile(realBinary, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	userBinDir := t.TempDir()
	symlinkOrSkip(t, realBinary, filepath.Join(userBinDir, "kb-dev"))

	check := checkBinariesAgainst(platformDir, userBinDir)
	if !check.OK {
		t.Errorf("checkBinariesAgainst() = %+v, want OK for a symlink resolving under <platformDir>/bin", check)
	}
}

// TestCheckBinariesAgainstDanglingSymlink reproduces the exact failure mode
// from the 2026-08-12 incident: ~/.local/bin/kb-dev symlinked into a /tmp
// build directory that was later reclaimed by macOS's periodic temp
// cleanup, leaving a dangling symlink that `kb-dev` (bare command) still
// appeared to "exist" for, while silently resolving to nothing.
func TestCheckBinariesAgainstDanglingSymlink(t *testing.T) {
	platformDir := t.TempDir()
	binDir := filepath.Join(platformDir, "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(binDir, "kb-dev"), []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	userBinDir := t.TempDir()
	goneTarget := filepath.Join(t.TempDir(), "reclaimed-build-dir", "kb-dev")
	symlinkOrSkip(t, goneTarget, filepath.Join(userBinDir, "kb-dev"))

	check := checkBinariesAgainst(platformDir, userBinDir)
	if check.OK {
		t.Fatal("checkBinariesAgainst() = OK for a dangling symlink, want a failure")
	}
	if check.Soft {
		t.Error("a dangling binary symlink must be a hard failure, not advisory")
	}
	if !strings.Contains(check.Details, "kb-dev") || !strings.Contains(check.Details, "target missing") {
		t.Errorf("check.Details = %q, want it to name kb-dev and say the target is missing", check.Details)
	}
}

// TestCheckBinariesAgainstSymlinkOutsidePlatformTree covers the other rot
// pattern: the symlink resolves to a real, existing file, but one that
// belongs to a different platform install (e.g. a stale symlink left over
// after `--platform` pointed somewhere else) rather than the one being
// checked.
func TestCheckBinariesAgainstSymlinkOutsidePlatformTree(t *testing.T) {
	platformDir := t.TempDir()
	binDir := filepath.Join(platformDir, "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(binDir, "kb-dev"), []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	otherPlatformBinary := filepath.Join(t.TempDir(), "kb-dev")
	if err := os.WriteFile(otherPlatformBinary, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	userBinDir := t.TempDir()
	symlinkOrSkip(t, otherPlatformBinary, filepath.Join(userBinDir, "kb-dev"))

	check := checkBinariesAgainst(platformDir, userBinDir)
	if check.OK {
		t.Fatal("checkBinariesAgainst() = OK for a symlink pointing at a different platform's binary, want a failure")
	}
	if !strings.Contains(check.Details, "points outside") {
		t.Errorf("check.Details = %q, want it to explain the symlink points outside the platform tree", check.Details)
	}
}

// TestCheckBinariesAgainstIgnoresBinariesThisPlatformNeverInstalled
// reproduces a real e2e failure found while dogfooding this check: a
// scratch platform install that only selects kb-dev (kb-devkit/kb-deploy/
// kb-monitor are not part of its intent) must not be flagged just because
// ~/.local/bin/kb-devkit still points at a *different*, legitimately
// installed platform (e.g. the user's real prod install) — this platform
// never claimed to own that binary in the first place.
func TestCheckBinariesAgainstIgnoresBinariesThisPlatformNeverInstalled(t *testing.T) {
	platformDir := t.TempDir()
	binDir := filepath.Join(platformDir, "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}
	// This platform only installed kb-dev — kb-devkit was never selected.
	if err := os.WriteFile(filepath.Join(binDir, "kb-dev"), []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	// A different, unrelated platform install owns kb-devkit.
	otherPlatformDir := t.TempDir()
	otherPlatformBin := filepath.Join(otherPlatformDir, "kb-devkit")
	if err := os.WriteFile(otherPlatformBin, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	userBinDir := t.TempDir()
	symlinkOrSkip(t, filepath.Join(binDir, "kb-dev"), filepath.Join(userBinDir, "kb-dev"))
	symlinkOrSkip(t, otherPlatformBin, filepath.Join(userBinDir, "kb-devkit"))

	check := checkBinariesAgainst(platformDir, userBinDir)
	if !check.OK {
		t.Errorf("checkBinariesAgainst() = %+v, want OK — kb-devkit belongs to a different platform this install never claimed", check)
	}
}

func TestCheckBinariesAgainstMissingLinksAreIgnored(t *testing.T) {
	// No entries in userBinDir at all — an optional binary the user never
	// installed is not this check's concern (checkKBDev/checkKBCLI cover
	// "not in PATH" for the required ones).
	platformDir := t.TempDir()
	binDir := filepath.Join(platformDir, "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}
	userBinDir := t.TempDir()

	check := checkBinariesAgainst(platformDir, userBinDir)
	if !check.OK {
		t.Errorf("checkBinariesAgainst() = %+v, want OK when no symlinks exist yet to be broken", check)
	}
}

func TestCheckBinariesAgainstSkipsWhenPlatformBinMissing(t *testing.T) {
	// <platformDir>/bin doesn't exist yet — checkPlatform/checkKBDev already
	// report the more fundamental "not installed" problem; this check must
	// not pile on a confusing second failure.
	platformDir := t.TempDir() // no "bin" subdir created
	userBinDir := t.TempDir()

	check := checkBinariesAgainst(platformDir, userBinDir)
	if !check.OK || !check.Soft {
		t.Errorf("checkBinariesAgainst() = %+v, want a soft pass when <platformDir>/bin doesn't exist", check)
	}
}
