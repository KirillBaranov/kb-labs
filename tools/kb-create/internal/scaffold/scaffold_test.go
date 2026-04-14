package scaffold

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWriteProjectConfig_FullSelection(t *testing.T) {
	dir := t.TempDir()
	platformDir := t.TempDir()

	err := WriteProjectConfig(dir, Options{
		PlatformDir: platformDir,
		Services:    []string{"rest", "workflow"},
		Plugins:     []string{"mind", "commit"},
	})
	if err != nil {
		t.Fatalf("WriteProjectConfig() error = %v", err)
	}

	content := readConfig(t, dir)

	// Top-level sections.
	assertContains(t, content, `"platform"`, "platform section")
	assertContains(t, content, `"adapters"`, "adapters block")
	assertContains(t, content, `"services"`, "services section")
	assertContains(t, content, `"plugins"`, "plugins section")

	// Platform dir injected.
	assertContains(t, content, platformDir, "platform dir value")

	// Selected services enabled, unselected disabled.
	assertContains(t, content, `"rest": true`, "rest enabled")
	assertContains(t, content, `"workflow": true`, "workflow enabled")
	assertContains(t, content, `"studio": false`, "studio disabled")

	// Selected plugins enabled, unselected disabled.
	assertContains(t, content, `"mind": {`, "mind plugin block")
	assertContains(t, content, `"commit": {`, "commit plugin block")
	assertPluginEnabled(t, content, "mind", true)
	assertPluginEnabled(t, content, "commit", true)
	assertPluginEnabled(t, content, "agents", false)
	assertPluginEnabled(t, content, "ai-review", false)

	// JSONC comments present.
	assertContains(t, content, "//", "JSONC comments")
}

func TestWriteProjectConfig_EmptySelection(t *testing.T) {
	dir := t.TempDir()

	err := WriteProjectConfig(dir, Options{
		PlatformDir: "/opt/kb",
	})
	if err != nil {
		t.Fatalf("WriteProjectConfig() error = %v", err)
	}

	content := readConfig(t, dir)

	// All services disabled.
	assertContains(t, content, `"rest": false`, "rest disabled")
	assertContains(t, content, `"workflow": false`, "workflow disabled")
	assertContains(t, content, `"studio": false`, "studio disabled")

	// All plugins disabled.
	assertPluginEnabled(t, content, "mind", false)
	assertPluginEnabled(t, content, "agents", false)
	assertPluginEnabled(t, content, "ai-review", false)
	assertPluginEnabled(t, content, "commit", false)
}

func TestWriteProjectConfig_CreatesNestedDir(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "a", "b", "project")

	err := WriteProjectConfig(dir, Options{PlatformDir: "/tmp/plat"})
	if err != nil {
		t.Fatalf("WriteProjectConfig() error = %v", err)
	}

	path := filepath.Join(dir, ".kb", "kb.config.json")
	if _, err := os.Stat(path); err != nil {
		t.Errorf("config file not created at %s: %v", path, err)
	}
}

func TestWriteProjectConfig_FilePermissions(t *testing.T) {
	dir := t.TempDir()

	_ = WriteProjectConfig(dir, Options{PlatformDir: "/tmp"})

	info, err := os.Stat(filepath.Join(dir, ".kb", "kb.config.json"))
	if err != nil {
		t.Fatal(err)
	}
	perm := info.Mode().Perm()
	if perm&0o644 != 0o644 {
		t.Errorf("file permissions = %o, want at least 0644", perm)
	}
}

func TestWriteProjectConfig_Idempotent(t *testing.T) {
	dir := t.TempDir()
	opts := Options{
		PlatformDir: "/tmp/plat",
		Services:    []string{"rest"},
		Plugins:     []string{"mind"},
	}

	if err := WriteProjectConfig(dir, opts); err != nil {
		t.Fatal(err)
	}
	first := readConfig(t, dir)

	if err := WriteProjectConfig(dir, opts); err != nil {
		t.Fatal(err)
	}
	second := readConfig(t, dir)

	if first != second {
		t.Error("WriteProjectConfig is not idempotent — output differs on second call")
	}
}

func TestGenerate_AdapterDefaults(t *testing.T) {
	content := generate(Options{PlatformDir: "/x"})

	defaults := []string{
		`"llm": "@kb-labs/adapters-kblabs-gateway"`,
		`"storage": "@kb-labs/adapters-fs"`,
		`"logger": "@kb-labs/adapters-pino"`,
		`"logRingBuffer": "@kb-labs/adapters-log-ringbuffer"`,
		`"analytics": "@kb-labs/adapters-analytics-file"`,
		`"eventBus": "@kb-labs/adapters-eventbus-cache"`,
		`"mode": "worker-pool"`,
	}
	for _, d := range defaults {
		assertContains(t, content, d, "adapter default")
	}
}

func TestGenerate_PluginInnerConfig(t *testing.T) {
	content := generate(Options{
		PlatformDir: "/x",
		Plugins:     []string{"mind", "agents", "ai-review", "commit"},
	})

	// Each plugin has its own inner config keys.
	assertContains(t, content, `"vectorStore"`, "mind inner config")
	assertContains(t, content, `"maxSteps"`, "agents inner config")
	assertContains(t, content, `"mode": "full"`, "ai-review inner config")
	assertContains(t, content, `"autoStage"`, "commit inner config")
}

// ── helpers ──────────────────────────────────────────────────────────────────

func readConfig(t *testing.T, projectDir string) string {
	t.Helper()
	// #nosec G304 -- test reads a file created under its own temp project dir.
	data, err := os.ReadFile(filepath.Join(projectDir, ".kb", "kb.config.json"))
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	return string(data)
}

func assertContains(t *testing.T, content, substr, label string) {
	t.Helper()
	if !strings.Contains(content, substr) {
		t.Errorf("%s: expected %q in output", label, substr)
	}
}

func assertPluginEnabled(t *testing.T, content, pluginID string, wantEnabled bool) {
	t.Helper()
	// Find the plugin block and check its enabled field.
	blockStart := strings.Index(content, `"`+pluginID+`": {`)
	if blockStart == -1 {
		t.Errorf("plugin %q block not found", pluginID)
		return
	}
	// Look at the next ~100 chars after the block start for "enabled".
	snippet := content[blockStart:]
	if len(snippet) > 150 {
		snippet = snippet[:150]
	}

	wantStr := `"enabled": false`
	if wantEnabled {
		wantStr = `"enabled": true`
	}
	if !strings.Contains(snippet, wantStr) {
		t.Errorf("plugin %q: expected %s", pluginID, wantStr)
	}
}
