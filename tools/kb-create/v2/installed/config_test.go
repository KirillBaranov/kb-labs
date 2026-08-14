package installed

import (
	"os"
	"path/filepath"
	"testing"
)

func TestConfiguredPathsReturnsPresenceOnly(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, ".kb"), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".kb", "kb.config.jsonc"), []byte(`{"plugin":{"url":"https://example.test"}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	paths, err := ConfiguredPaths(root, []string{"/plugin/url", "/plugin/token"})
	if err != nil || !paths["/plugin/url"] || paths["/plugin/token"] {
		t.Fatalf("paths/error = %#v / %v", paths, err)
	}
}
