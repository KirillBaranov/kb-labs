package scaffold

import (
	"path/filepath"
	"testing"
)

func TestArchiveTargetRejectsPathTraversal(t *testing.T) {
	dest := t.TempDir()
	for _, name := range []string{"../escape", "/absolute", ".."} {
		if _, err := archiveTarget(dest, name); err == nil {
			t.Fatalf("archiveTarget(%q) accepted an escaping path", name)
		}
	}

	target, err := archiveTarget(dest, "package/manifest.json")
	if err != nil {
		t.Fatalf("archiveTarget returned an unexpected error: %v", err)
	}
	if target != filepath.Join(dest, "package", "manifest.json") {
		t.Fatalf("unexpected target %q", target)
	}
}
