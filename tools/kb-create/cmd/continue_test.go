package cmd

import (
	"strings"
	"testing"

	"github.com/kb-labs/create/internal/onboarding"
)

func TestRecoverOnboardingDoesNotPretendInterruptedInstallCanResume(t *testing.T) {
	_, err := recoverOnboarding(onboarding.State{
		Outcome: "release", ProjectDir: t.TempDir(), Status: "installing",
	})
	if err == nil {
		t.Fatal("recoverOnboarding() accepted an interrupted installation")
	}
	if !strings.Contains(err.Error(), "rerun kb-create") {
		t.Errorf("error = %q, want a concrete rerun action", err)
	}
}

func TestRecoverOnboardingRejectsUnknownCheckpointStatus(t *testing.T) {
	_, err := recoverOnboarding(onboarding.State{
		Outcome: "release", ProjectDir: t.TempDir(), Status: "mystery",
	})
	if err == nil {
		t.Fatal("recoverOnboarding() accepted an unknown checkpoint status")
	}
	if !strings.Contains(err.Error(), "kb-create doctor") {
		t.Errorf("error = %q, want doctor guidance", err)
	}
}
