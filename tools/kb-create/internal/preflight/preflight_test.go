package preflight

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kb-labs/create/internal/pm"
)

func TestCheckRejectsMissingProjectBeforeWriting(t *testing.T) {
	root := t.TempDir()
	err := Check(filepath.Join(root, "missing"), filepath.Join(root, "platform"), pm.Detect())
	if err == nil || !strings.Contains(err.Error(), "project directory") {
		t.Fatalf("Check() error = %v, want missing project diagnostic", err)
	}
	if _, statErr := os.Stat(filepath.Join(root, "platform")); !os.IsNotExist(statErr) {
		t.Fatalf("Check() created platform directory before failing: %v", statErr)
	}
}

func TestWritableParentRejectsFile(t *testing.T) {
	root := t.TempDir()
	file := filepath.Join(root, "not-a-directory")
	if err := os.WriteFile(file, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	err := writableParent("platform", filepath.Join(file, "child"))
	if err == nil || !strings.Contains(err.Error(), "not a directory") {
		t.Fatalf("writableParent() error = %v, want non-directory diagnostic", err)
	}
}
