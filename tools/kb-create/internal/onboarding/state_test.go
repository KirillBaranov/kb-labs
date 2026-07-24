package onboarding

import (
	"os"
	"strings"
	"testing"

	"github.com/kb-labs/create/internal/manifest"
)

func TestWriteReadRoundTripOmitsSecrets(t *testing.T) {
	project := t.TempDir()
	want := State{
		Outcome:     "release",
		ProjectDir:  project,
		PlatformDir: "/tmp/platform",
		LocalMode:   true,
		Status:      "ready",
		FirstCommand: &manifest.FirstCommand{
			Command: "kb release plan", Operation: manifest.CommandOperationAnalyze,
		},
	}
	if err := Write(want); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	got, err := Read(project)
	if err != nil {
		t.Fatalf("Read() error = %v", err)
	}
	if got.Outcome != want.Outcome || got.FirstCommand == nil || got.FirstCommand.Command != want.FirstCommand.Command {
		t.Fatalf("state = %+v, want outcome and first command preserved", got)
	}
	raw, err := os.ReadFile(Path(project))
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"\"apiKey\"", "\"llmKey\"", "\"diff\"", "\"prompt\""} {
		if strings.Contains(string(raw), forbidden) {
			t.Errorf("state contains forbidden data marker %q: %s", forbidden, raw)
		}
	}
}

func TestCheckReadinessRejectsUnsafeOrMissingCommand(t *testing.T) {
	if err := CheckReadiness(t.TempDir(), &manifest.FirstCommand{Command: "kb release publish", Operation: manifest.CommandOperationMutate}); err == nil {
		t.Fatal("CheckReadiness() accepted a mutating first command")
	}
	if err := CheckReadiness(t.TempDir(), &manifest.FirstCommand{Command: "kb release plan", Operation: manifest.CommandOperationAnalyze}); err == nil {
		t.Fatal("CheckReadiness() accepted a platform with no CLI")
	}
}
