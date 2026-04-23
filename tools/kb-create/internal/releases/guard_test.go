package releases

import (
	"path/filepath"
	"testing"
)

func TestEnsureSameFilesystem_SameDir(t *testing.T) {
	root := t.TempDir()
	releases := filepath.Join(root, "releases")
	services := filepath.Join(root, "services")
	if err := EnsureSameFilesystem(releases, services); err != nil {
		t.Errorf("same root should pass, got %v", err)
	}
}

func TestEnsureSameFilesystem_CreatesMissingDirs(t *testing.T) {
	root := t.TempDir()
	releases := filepath.Join(root, "not-yet", "releases")
	services := filepath.Join(root, "not-yet", "services")
	if err := EnsureSameFilesystem(releases, services); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Both should exist now.
	if _, err := deviceOf(releases); err != nil {
		t.Errorf("releases not created: %v", err)
	}
	if _, err := deviceOf(services); err != nil {
		t.Errorf("services not created: %v", err)
	}
}
