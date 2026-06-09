package cmd

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// TestResolveUpdateRegistry_flagOverrides verifies that an explicit --registry
// flag always wins over any saved config.
func TestResolveUpdateRegistry_flagOverrides(t *testing.T) {
	dir := t.TempDir()
	writeSavedRegistry(t, dir, "http://localhost:4873")

	got := resolveUpdateRegistry("https://custom.registry.io/", dir)
	if got != "https://custom.registry.io/" {
		t.Errorf("flag should override saved: got %q, want %q", got, "https://custom.registry.io/")
	}
}

// TestResolveUpdateRegistry_usesSaved verifies that when --registry is empty
// the function reads the registry saved during the original install (B-014).
// Before the fix this path did not exist, causing updates to default to npmjs.org
// and break the platform when packages were installed from a local Verdaccio.
func TestResolveUpdateRegistry_usesSaved(t *testing.T) {
	dir := t.TempDir()
	writeSavedRegistry(t, dir, "http://localhost:4873")

	got := resolveUpdateRegistry("", dir)
	if got != "http://localhost:4873" {
		t.Errorf("should reuse saved registry: got %q, want %q", got, "http://localhost:4873")
	}
}

// TestResolveUpdateRegistry_emptyWhenNoConfig verifies that a missing or
// unreadable config returns empty string (defer to pm.Detect default).
func TestResolveUpdateRegistry_emptyWhenNoConfig(t *testing.T) {
	dir := t.TempDir() // no config written

	got := resolveUpdateRegistry("", dir)
	if got != "" {
		t.Errorf("no config → should return empty: got %q", got)
	}
}

// TestResolveUpdateRegistry_emptyRegistryInConfig verifies that a config
// with an empty registry field also returns empty (npmjs default).
func TestResolveUpdateRegistry_emptyRegistryInConfig(t *testing.T) {
	dir := t.TempDir()
	writeSavedRegistry(t, dir, "") // explicitly empty

	got := resolveUpdateRegistry("", dir)
	if got != "" {
		t.Errorf("empty saved registry → should return empty: got %q", got)
	}
}

// writeSavedRegistry writes a minimal platform config with the given registry
// to the path that config.Read() expects.
func writeSavedRegistry(t *testing.T, platformDir, registry string) {
	t.Helper()
	kbDir := filepath.Join(platformDir, ".kb")
	if err := os.MkdirAll(kbDir, 0o755); err != nil {
		t.Fatalf("mkdir .kb: %v", err)
	}
	cfg := map[string]interface{}{
		"source": map[string]interface{}{
			"registry":    registry,
			"installedBy": "kb-create@test",
		},
	}
	data, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("marshal config: %v", err)
	}
	cfgPath := filepath.Join(kbDir, "install.json")
	if err := os.WriteFile(cfgPath, data, 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}
}
