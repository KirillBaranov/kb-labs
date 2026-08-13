package catalog

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadFileRequiresPlatformBundle(t *testing.T) {
	path := filepath.Join(t.TempDir(), "index.json")
	if err := os.WriteFile(path, []byte(`{}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadFile(path); err == nil {
		t.Fatal("expected missing platform validation")
	}
}
