package environ

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestResolve(t *testing.T) {
	cache := Resolve()

	if cache.ResolvedAt.IsZero() {
		t.Error("ResolvedAt should be set")
	}
	if cache.Shell == "" {
		t.Error("Shell should not be empty")
	}
	// Node might not be on PATH in CI, but the function shouldn't panic.
	t.Logf("node=%s pnpm=%s docker=%s shell=%s extra=%v",
		cache.Node, cache.Pnpm, cache.Docker, cache.Shell, cache.ExtraPath)
}

func TestCacheRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "env-cache.json")

	original := &EnvCache{
		ResolvedAt: time.Now().Truncate(time.Second),
		Node:       "/usr/local/bin/node",
		Pnpm:       "/usr/local/bin/pnpm",
		Shell:      "/bin/zsh",
		ExtraPath:  []string{"/usr/local/bin", "/opt/homebrew/bin"},
	}

	if err := original.Save(path); err != nil {
		t.Fatalf("Save() error: %v", err)
	}

	loaded, err := LoadCache(path)
	if err != nil {
		t.Fatalf("LoadCache() error: %v", err)
	}

	if loaded.Node != original.Node {
		t.Errorf("Node = %q, want %q", loaded.Node, original.Node)
	}
	if loaded.Shell != original.Shell {
		t.Errorf("Shell = %q, want %q", loaded.Shell, original.Shell)
	}
	if len(loaded.ExtraPath) != len(original.ExtraPath) {
		t.Errorf("ExtraPath len = %d, want %d", len(loaded.ExtraPath), len(original.ExtraPath))
	}
}

func TestLoadCacheMissing(t *testing.T) {
	cache, err := LoadCache("/nonexistent/path/env-cache.json")
	if err != nil {
		t.Fatalf("LoadCache() should return nil for missing file, got error: %v", err)
	}
	if cache != nil {
		t.Error("expected nil cache for missing file")
	}
}

func TestIsStale(t *testing.T) {
	// Fresh cache with existing binary.
	self, _ := os.Executable()
	fresh := &EnvCache{
		ResolvedAt: time.Now(),
		Node:       self, // this binary exists
	}
	if fresh.IsStale() {
		t.Error("fresh cache should not be stale")
	}

	// Old cache.
	old := &EnvCache{
		ResolvedAt: time.Now().Add(-48 * time.Hour),
	}
	if !old.IsStale() {
		t.Error("48h old cache should be stale")
	}

	// Cache with missing binary.
	gone := &EnvCache{
		ResolvedAt: time.Now(),
		Node:       "/nonexistent/binary/node",
	}
	if !gone.IsStale() {
		t.Error("cache with missing binary should be stale")
	}
}

func TestBuildPath(t *testing.T) {
	cache := &EnvCache{
		ExtraPath: []string{"/a", "/b"},
	}

	path := cache.BuildPath()
	if path == "" {
		t.Error("BuildPath should not be empty")
	}
	if len(path) < 4 { // at minimum "/a:/b"
		t.Errorf("BuildPath too short: %q", path)
	}
}
