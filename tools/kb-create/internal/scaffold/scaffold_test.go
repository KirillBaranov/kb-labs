package scaffold

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ── WritePlatformConfig ───────────────────────────────────────────────────────

func TestWritePlatformConfig_FullSelection(t *testing.T) {
	platformDir := t.TempDir()

	err := WritePlatformConfig(platformDir, Options{
		PlatformDir: platformDir,
		Services:    []string{"rest", "workflow"},
		Plugins:     []string{"mind", "commit"},
	})
	if err != nil {
		t.Fatalf("WritePlatformConfig() error = %v", err)
	}

	content := readKbConfig(t, platformDir)

	// Full config: all sections present.
	assertContains(t, content, `"platform"`, "platform section")
	assertContains(t, content, `"adapters"`, "adapters block")
	assertContains(t, content, `"adapterOptions"`, "adapterOptions block")
	assertContains(t, content, `"services"`, "services section")
	assertContains(t, content, `"plugins"`, "plugins section")

	// Platform dir injected.
	assertContains(t, content, platformDir, "platform dir value")

	// Selected services enabled, unselected disabled.
	assertContains(t, content, `"rest": true`, "rest enabled")
	assertContains(t, content, `"workflow": true`, "workflow enabled")
	assertContains(t, content, `"studio": false`, "studio disabled")

	// Selected plugins enabled, unselected disabled.
	assertPluginEnabled(t, content, "mind", true)
	assertPluginEnabled(t, content, "commit", true)
	assertPluginEnabled(t, content, "agents", false)

	// JSONC comments present.
	assertContains(t, content, "//", "JSONC comments")
}

func TestWritePlatformConfig_AlwaysOverwrites(t *testing.T) {
	platformDir := t.TempDir()
	opts := Options{PlatformDir: platformDir, Services: []string{"rest"}}

	// First write.
	if err := WritePlatformConfig(platformDir, opts); err != nil {
		t.Fatal(err)
	}

	// Modify the file to simulate user editing.
	cfgPath := filepath.Join(platformDir, ".kb", "kb.config.jsonc")
	if err := os.WriteFile(cfgPath, []byte("EDITED"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Second write should overwrite regardless.
	if err := WritePlatformConfig(platformDir, opts); err != nil {
		t.Fatal(err)
	}

	content := readKbConfig(t, platformDir)
	if content == "EDITED" {
		t.Error("WritePlatformConfig did not overwrite existing file")
	}
	assertContains(t, content, `"platform"`, "platform section present after overwrite")
}

func TestWritePlatformConfig_CreatesDir(t *testing.T) {
	platformDir := filepath.Join(t.TempDir(), "nested", "platform")

	err := WritePlatformConfig(platformDir, Options{PlatformDir: platformDir})
	if err != nil {
		t.Fatalf("WritePlatformConfig() error = %v", err)
	}

	if _, err := os.Stat(filepath.Join(platformDir, ".kb", "kb.config.jsonc")); err != nil {
		t.Errorf("config file not created: %v", err)
	}
}

// ── WriteProjectConfig ────────────────────────────────────────────────────────

func TestWriteProjectConfig_WritesPointer(t *testing.T) {
	projectDir := t.TempDir()
	platformDir := t.TempDir()

	err := WriteProjectConfig(projectDir, Options{
		PlatformDir: platformDir,
		Services:    []string{"rest", "workflow"},
		Plugins:     []string{"mind"},
	})
	if err != nil {
		t.Fatalf("WriteProjectConfig() error = %v", err)
	}

	content := readKbConfig(t, projectDir)

	// Must have platform.dir pointing to platformDir.
	assertContains(t, content, platformDir, "platform dir in pointer")

	// Must NOT contain installer-owned sections (those live in platformDir only).
	if strings.Contains(content, `"adapters"`) {
		t.Error("project config must not contain adapters (platform-owned)")
	}
	if strings.Contains(content, `"adapterOptions"`) {
		t.Error("project config must not contain adapterOptions (platform-owned)")
	}
}

func TestWriteProjectConfig_SkipsIfJsoncExists(t *testing.T) {
	projectDir := t.TempDir()

	kbDir := filepath.Join(projectDir, ".kb")
	if err := os.MkdirAll(kbDir, 0o750); err != nil {
		t.Fatal(err)
	}
	customContent := `{"custom": true}`
	cfgPath := filepath.Join(kbDir, "kb.config.jsonc")
	if err := os.WriteFile(cfgPath, []byte(customContent), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := WriteProjectConfig(projectDir, Options{PlatformDir: "/some/platform"}); err != nil {
		t.Fatal(err)
	}

	content := readKbConfig(t, projectDir)
	if content != customContent {
		t.Errorf("existing jsonc config was overwritten; got %q, want %q", content, customContent)
	}
}

func TestWriteProjectConfig_SkipsIfJsonExists(t *testing.T) {
	projectDir := t.TempDir()

	// Pre-create kb.config.json (not jsonc) — the dev config convention.
	kbDir := filepath.Join(projectDir, ".kb")
	if err := os.MkdirAll(kbDir, 0o750); err != nil {
		t.Fatal(err)
	}
	customContent := `{"platform":{"dir":"/old/path"}}`
	jsonPath := filepath.Join(kbDir, "kb.config.json")
	if err := os.WriteFile(jsonPath, []byte(customContent), 0o644); err != nil {
		t.Fatal(err)
	}

	// WriteProjectConfig must not create kb.config.jsonc when kb.config.json exists.
	if err := WriteProjectConfig(projectDir, Options{PlatformDir: "/some/platform"}); err != nil {
		t.Fatal(err)
	}

	// jsonc must not be created.
	jsoncPath := filepath.Join(kbDir, "kb.config.jsonc")
	if _, err := os.Stat(jsoncPath); !os.IsNotExist(err) {
		t.Error("WriteProjectConfig created kb.config.jsonc even though kb.config.json already existed")
	}
	// json must be unchanged.
	data, _ := os.ReadFile(jsonPath)
	if string(data) != customContent {
		t.Errorf("existing json config was modified; got %q", string(data))
	}
}

func TestWriteProjectConfig_CreatesDir(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "a", "b", "project")

	err := WriteProjectConfig(dir, Options{PlatformDir: "/tmp/plat"})
	if err != nil {
		t.Fatalf("WriteProjectConfig() error = %v", err)
	}

	if _, err := os.Stat(filepath.Join(dir, ".kb", "kb.config.jsonc")); err != nil {
		t.Errorf("config file not created: %v", err)
	}
}

func TestWriteProjectConfig_FilePermissions(t *testing.T) {
	dir := t.TempDir()

	_ = WriteProjectConfig(dir, Options{PlatformDir: "/tmp"})

	info, err := os.Stat(filepath.Join(dir, ".kb", "kb.config.jsonc"))
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
	first := readKbConfig(t, dir)

	// Second call: file exists — must be skipped, content unchanged.
	if err := WriteProjectConfig(dir, opts); err != nil {
		t.Fatal(err)
	}
	second := readKbConfig(t, dir)

	if first != second {
		t.Error("WriteProjectConfig is not idempotent — file changed on second call")
	}
}

// ── SameRoot: WritePlatformConfig + WriteProjectConfig ────────────────────────

// When platformDir == projectDir, WritePlatformConfig writes the full config
// there first; WriteProjectConfig must then skip writing the pointer since
// the file already exists.
func TestSameRoot_FullConfigPreserved(t *testing.T) {
	root := t.TempDir()
	opts := Options{
		PlatformDir: root,
		Services:    []string{"rest"},
	}

	if err := WritePlatformConfig(root, opts); err != nil {
		t.Fatal(err)
	}
	if err := WriteProjectConfig(root, opts); err != nil {
		t.Fatal(err)
	}

	content := readKbConfig(t, root)

	// Full config (from WritePlatformConfig) must be preserved — not replaced by pointer.
	assertContains(t, content, `"adapters"`, "full config preserved in same-root scenario")
}

// ── ReadPlatformOptions ───────────────────────────────────────────────────────

func TestReadPlatformOptions_RoundTrip(t *testing.T) {
	platformDir := t.TempDir()
	opts := Options{
		PlatformDir: platformDir,
		Services:    []string{"rest", "workflow"},
		Plugins:     []string{"agents", "commit"},
	}

	// Write then read back.
	if err := WritePlatformConfig(platformDir, opts); err != nil {
		t.Fatal(err)
	}
	got := ReadPlatformOptions(platformDir)

	assertStringSliceContains(t, got.Services, "rest", "rest service")
	assertStringSliceContains(t, got.Services, "workflow", "workflow service")
	assertStringSliceContains(t, got.Plugins, "agents", "agents plugin")
	assertStringSliceContains(t, got.Plugins, "commit", "commit plugin")

	// Disabled entries must not be returned.
	for _, s := range got.Services {
		if s == "studio" {
			t.Error("studio was not selected but appears in ReadPlatformOptions result")
		}
	}
}

func TestReadPlatformOptions_MissingFile(t *testing.T) {
	platformDir := t.TempDir()
	// No config written — must return minimal opts without error.
	opts := ReadPlatformOptions(platformDir)
	if opts.PlatformDir != platformDir {
		t.Errorf("PlatformDir = %q, want %q", opts.PlatformDir, platformDir)
	}
	if len(opts.Services) != 0 || len(opts.Plugins) != 0 {
		t.Error("expected empty slices for missing config")
	}
}

// ── generateFull ─────────────────────────────────────────────────────────────

func TestGenerateFull_AdapterDefaults(t *testing.T) {
	content := generateFull(Options{PlatformDir: "/x"})

	defaults := []string{
		`"llm": "@kb-labs/adapters-kblabs-gateway"`,
		`"storage": "@kb-labs/adapters-fs"`,
		`"logger": "@kb-labs/adapters-pino"`,
		`"logRingBuffer": "@kb-labs/adapters-log-ringbuffer"`,
		`"analytics": "@kb-labs/adapters-analytics-file"`,
		`"mode": "worker-pool"`,
	}
	for _, d := range defaults {
		assertContains(t, content, d, "adapter default")
	}
}

func TestGenerateFull_PluginInnerConfig(t *testing.T) {
	content := generateFull(Options{
		PlatformDir: "/x",
		Plugins:     []string{"mind", "agents", "ai-review", "commit"},
	})

	assertContains(t, content, `"vectorStore"`, "mind inner config")
	assertContains(t, content, `"maxSteps"`, "agents inner config")
	assertContains(t, content, `"mode": "full"`, "ai-review inner config")
	assertContains(t, content, `"autoStage"`, "commit inner config")
}

func TestGenerateFull_GatewayUpstreams(t *testing.T) {
	content := generateFull(Options{PlatformDir: "/x"})

	assertContains(t, content, `"gateway"`, "gateway section")
	assertContains(t, content, `"upstreams"`, "upstreams block")
	assertContains(t, content, `"rest"`, "rest upstream")
	assertContains(t, content, `http://localhost:5050`, "REST URL")
	assertContains(t, content, `"workflow"`, "workflow upstream")
	assertContains(t, content, `"marketplace"`, "marketplace upstream")
	assertContains(t, content, `"widgets"`, "widgets upstream")

	// stripGeneratedJsonc must not corrupt URLs (//[^\n]* must not eat into http://)
	stripped := stripGeneratedJsonc(content)
	if !strings.Contains(stripped, "http://localhost:5050") {
		t.Error("stripGeneratedJsonc corrupted http://localhost:5050 URL in gateway section")
	}
	if !strings.Contains(stripped, "http://localhost:7778") {
		t.Error("stripGeneratedJsonc corrupted http://localhost:7778 URL in gateway section")
	}
	if !strings.Contains(stripped, "http://localhost:5070") {
		t.Error("stripGeneratedJsonc corrupted http://localhost:5070 URL in gateway section")
	}
}

// ── generatePointer ───────────────────────────────────────────────────────────

func TestGeneratePointer_ContainsPlatformDir(t *testing.T) {
	platformDir := "/opt/kb-platform"
	content := generatePointer(platformDir)

	assertContains(t, content, platformDir, "platform dir in pointer config")
	assertContains(t, content, `"platform"`, "platform section")
	assertContains(t, content, `"dir"`, "dir field")

	// Must not contain installer-owned sections.
	if strings.Contains(content, `"adapters"`) {
		t.Error("pointer config must not contain adapters")
	}
	if strings.Contains(content, `"adapterOptions"`) {
		t.Error("pointer config must not contain adapterOptions")
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

func readKbConfig(t *testing.T, root string) string {
	t.Helper()
	// #nosec G304 -- test reads a file created under its own temp dir.
	data, err := os.ReadFile(filepath.Join(root, ".kb", "kb.config.jsonc"))
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	return string(data)
}

func assertStringSliceContains(t *testing.T, slice []string, want, label string) {
	t.Helper()
	for _, s := range slice {
		if s == want {
			return
		}
	}
	t.Errorf("%s: %q not found in %v", label, want, slice)
}

func assertContains(t *testing.T, content, substr, label string) {
	t.Helper()
	if !strings.Contains(content, substr) {
		t.Errorf("%s: expected %q in output", label, substr)
	}
}

func assertPluginEnabled(t *testing.T, content, pluginID string, wantEnabled bool) {
	t.Helper()
	blockStart := strings.Index(content, `"`+pluginID+`": {`)
	if blockStart == -1 {
		t.Errorf("plugin %q block not found", pluginID)
		return
	}
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
