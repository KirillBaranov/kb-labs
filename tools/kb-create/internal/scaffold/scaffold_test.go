package scaffold

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kb-labs/create/internal/gateway"
	"github.com/kb-labs/create/internal/manifest"
)

// testCatalog mirrors the real manifest.json's services/plugins shape closely
// enough for scaffold rendering tests: 5 services (gateway intentionally
// present, to exercise servicesWithoutToggle's exclusion) and the 6 plugins
// with known custom inner config plus one without (mirroring "release").
func testCatalog() *manifest.Manifest {
	return &manifest.Manifest{
		Services: []manifest.Component{
			{ID: "rest", Pkg: "@kb-labs/rest-api-app", Description: "REST API (port 5050)", Default: true},
			{ID: "workflow", Pkg: "@kb-labs/workflow-daemon", Description: "Workflow engine (port 7778)", Default: true},
			{ID: "gateway", Pkg: "@kb-labs/gateway-app", Description: "Central router (port 4000)", Default: true},
			{ID: "marketplace", Pkg: "@kb-labs/marketplace-app", Description: "Marketplace (port 5070)", Default: true},
			{ID: "studio", Pkg: "@kb-labs/studio-app", Description: "Web UI (port 3000)", Default: true},
		},
		Plugins: []manifest.Component{
			{ID: "marketplace", Pkg: "@kb-labs/marketplace-entry", Description: "Install, list, enable plugins", Default: true},
			{ID: "mind", Pkg: "@kb-labs/mind-entry", Description: "AI code search (RAG)", Default: false},
			{ID: "agents", Pkg: "@kb-labs/agent-entry", Description: "Autonomous agents", Default: false},
			{ID: "ai-review", Pkg: "@kb-labs/review-entry", Description: "AI code review", Default: true},
			{ID: "commit", Pkg: "@kb-labs/commit-entry", Description: "AI commit generation", Default: true},
			{ID: "scaffold", Pkg: "@kb-labs/scaffold", Description: "Scaffold plugins and adapters", Default: true},
			{ID: "release", Pkg: "@kb-labs/release-manager-cli", Description: "Plan, execute, and audit releases across your workspace", Default: false},
		},
	}
}

// ── WritePlatformConfig ───────────────────────────────────────────────────────

func TestWritePlatformConfig_FullSelection(t *testing.T) {
	platformDir := t.TempDir()

	err := WritePlatformConfig(platformDir, Options{
		PlatformDir: platformDir,
		Services:    []string{"rest", "workflow"},
		Plugins:     []string{"mind", "commit"},
		Catalog:     testCatalog(),
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

// TestWritePlatformConfig_LocalMode verifies that local single-user mode
// (B-023) writes the gateway loopback host and auth-off into kb.config.jsonc —
// the runtime platform config, NOT kb.config.json (kb-create install state,
// which has no gateway section). This is the file the platform actually reads.
func TestWritePlatformConfig_LocalMode(t *testing.T) {
	platformDir := t.TempDir()
	authOff := false

	err := WritePlatformConfig(platformDir, Options{
		PlatformDir:        platformDir,
		Services:           []string{"gateway"},
		GatewayHost:        "127.0.0.1",
		GatewayAuthEnabled: &authOff,
	})
	if err != nil {
		t.Fatalf("WritePlatformConfig() error = %v", err)
	}

	content := readKbConfig(t, platformDir)
	assertContains(t, content, `"host": "127.0.0.1"`, "gateway loopback host")
	assertContains(t, content, `"auth": { "enabled": false }`, "gateway auth disabled")
}

// TestWritePlatformConfig_DefaultGateway verifies that without local-mode opts
// the gateway section omits the loopback host and the auth-off override — the
// safe default for server/CI/cloud installs.
func TestWritePlatformConfig_DefaultGateway(t *testing.T) {
	platformDir := t.TempDir()

	err := WritePlatformConfig(platformDir, Options{
		PlatformDir: platformDir,
		Services:    []string{"gateway"},
	})
	if err != nil {
		t.Fatalf("WritePlatformConfig() error = %v", err)
	}

	content := readKbConfig(t, platformDir)
	if strings.Contains(content, `"host": "127.0.0.1"`) {
		t.Errorf("default install must not pin gateway to loopback:\n%s", content)
	}
	if strings.Contains(content, `"auth": { "enabled": false }`) {
		t.Errorf("default install must not disable gateway auth:\n%s", content)
	}
}

func TestWritePlatformConfig_DocumentDatabase(t *testing.T) {
	platformDir := t.TempDir()

	err := WritePlatformConfig(platformDir, Options{
		PlatformDir:      platformDir,
		DocumentDatabase: "@kb-labs/adapters-sqlite",
		KVStore:          "@kb-labs/adapters-sqlite/kv",
	})
	if err != nil {
		t.Fatalf("WritePlatformConfig() error = %v", err)
	}

	content := readKbConfig(t, platformDir)

	assertContains(t, content, `"documentDatabase": "@kb-labs/adapters-sqlite"`, "documentDatabase adapter")
	assertContains(t, content, `"kvStore": "@kb-labs/adapters-sqlite/kv"`, "kvStore adapter")
	// adapterOptions must include the filename so the sqlite adapter can initialise.
	assertContains(t, content, `"documentDatabase": { "filename": ".kb/data/platform.db" }`, "documentDatabase adapterOptions")
	assertContains(t, content, `"kvStore": { "filename": ".kb/data/platform.db" }`, "kvStore adapterOptions")
}

func TestWritePlatformConfig_NoDocumentDatabase(t *testing.T) {
	platformDir := t.TempDir()

	err := WritePlatformConfig(platformDir, Options{PlatformDir: platformDir})
	if err != nil {
		t.Fatalf("WritePlatformConfig() error = %v", err)
	}

	content := readKbConfig(t, platformDir)

	// When not set, documentDatabase must not appear in the generated config.
	if strings.Contains(content, "documentDatabase") {
		t.Error("documentDatabase should not appear when Options.DocumentDatabase is empty")
	}
}

func TestWritePlatformConfig_SoloAuthOff(t *testing.T) {
	platformDir := t.TempDir()
	authOff := false

	err := WritePlatformConfig(platformDir, Options{
		PlatformDir:        platformDir,
		GatewayAuthEnabled: &authOff,
		GatewayHost:        "127.0.0.1",
	})
	if err != nil {
		t.Fatalf("WritePlatformConfig() error = %v", err)
	}

	content := readKbConfig(t, platformDir)
	assertContains(t, content, `"host": "127.0.0.1"`, "gateway host loopback")
	assertContains(t, content, `"auth": { "enabled": false }`, "gateway auth disabled")
}

// TestWritePlatformConfig_BootstrapAdminForNonLocal covers #271: non-local
// installs must render gateway.auth.bootstrap so the gateway seeds an admin
// and auto-provisions the CLI's first credential on first start.
func TestWritePlatformConfig_BootstrapAdminForNonLocal(t *testing.T) {
	platformDir := t.TempDir()
	authOn := true

	err := WritePlatformConfig(platformDir, Options{
		PlatformDir:            platformDir,
		GatewayAuthEnabled:     &authOn,
		BootstrapAdminEmail:    "admin@bootstrap.local",
		BootstrapTenantID:      "default",
		BootstrapAdminPassword: "irrelevant-here-not-rendered",
	})
	if err != nil {
		t.Fatalf("WritePlatformConfig() error = %v", err)
	}

	content := readKbConfig(t, platformDir)
	assertContains(t, content, `"tenantId": "default"`, "bootstrap tenantId")
	assertContains(t, content, `"adminEmail": "admin@bootstrap.local"`, "bootstrap adminEmail")
	assertContains(t, content, `"provisionCliCredentials": true`, "provisionCliCredentials flag")
	if strings.Contains(content, "irrelevant-here-not-rendered") {
		t.Error("admin password must never be rendered into kb.config.jsonc")
	}
}

// TestWritePlatformConfig_NoBootstrapForLocal covers the --local counterpart:
// no bootstrap section should ever appear when auth is disabled.
func TestWritePlatformConfig_NoBootstrapForLocal(t *testing.T) {
	platformDir := t.TempDir()
	authOff := false

	err := WritePlatformConfig(platformDir, Options{
		PlatformDir:        platformDir,
		GatewayAuthEnabled: &authOff,
		GatewayHost:        "127.0.0.1",
	})
	if err != nil {
		t.Fatalf("WritePlatformConfig() error = %v", err)
	}

	content := readKbConfig(t, platformDir)
	if strings.Contains(content, "bootstrap") {
		t.Error("local (auth-off) install must not render a gateway.auth.bootstrap section")
	}
}

func TestReadPlatformOptions_PreservesBootstrapAdmin(t *testing.T) {
	platformDir := t.TempDir()
	projectDir := t.TempDir()
	authOn := true

	if err := WritePlatformConfig(platformDir, Options{
		PlatformDir:            platformDir,
		GatewayAuthEnabled:     &authOn,
		BootstrapAdminEmail:    "admin@bootstrap.local",
		BootstrapTenantID:      "default",
		BootstrapAdminPassword: "original-random-password",
	}); err != nil {
		t.Fatalf("WritePlatformConfig() error = %v", err)
	}
	if err := WriteProjectConfig(projectDir, Options{
		PlatformDir:            platformDir,
		BootstrapAdminPassword: "original-random-password",
	}); err != nil {
		t.Fatalf("WriteProjectConfig() error = %v", err)
	}

	got := ReadPlatformOptions(platformDir, projectDir)
	if got.BootstrapAdminEmail != "admin@bootstrap.local" {
		t.Errorf("BootstrapAdminEmail not preserved: got %q", got.BootstrapAdminEmail)
	}
	if got.BootstrapTenantID != "default" {
		t.Errorf("BootstrapTenantID not preserved: got %q", got.BootstrapTenantID)
	}
	if got.BootstrapAdminPassword != "original-random-password" {
		t.Errorf("BootstrapAdminPassword not preserved: got %q", got.BootstrapAdminPassword)
	}

	// Simulate a second `kb-create update` run reusing the recovered options —
	// the password must round-trip unchanged, never regenerated.
	if err := WritePlatformConfig(platformDir, got); err != nil {
		t.Fatalf("second WritePlatformConfig() error = %v", err)
	}
	if err := WriteProjectConfig(projectDir, got); err != nil {
		t.Fatalf("second WriteProjectConfig() error = %v", err)
	}
	envData, err := os.ReadFile(filepath.Join(projectDir, ".env"))
	if err != nil {
		t.Fatalf("read .env: %v", err)
	}
	count := strings.Count(string(envData), "GATEWAY_BOOTSTRAP_ADMIN_PASSWORD=")
	if count != 1 {
		t.Errorf("expected exactly one GATEWAY_BOOTSTRAP_ADMIN_PASSWORD= line after two writes, got %d", count)
	}
	if !strings.Contains(string(envData), "GATEWAY_BOOTSTRAP_ADMIN_PASSWORD=original-random-password") {
		t.Error("bootstrap admin password must not be regenerated on repeat writes")
	}
}

func TestReadPlatformOptions_PreservesGatewayAuth(t *testing.T) {
	platformDir := t.TempDir()
	authOff := false

	// Write a solo (auth-off) config, then read it back via the update path.
	if err := WritePlatformConfig(platformDir, Options{
		PlatformDir:        platformDir,
		GatewayAuthEnabled: &authOff,
		GatewayHost:        "127.0.0.1",
	}); err != nil {
		t.Fatalf("WritePlatformConfig() error = %v", err)
	}

	got := ReadPlatformOptions(platformDir)
	if got.GatewayHost != "127.0.0.1" {
		t.Errorf("GatewayHost not preserved: got %q", got.GatewayHost)
	}
	if got.GatewayAuthEnabled == nil || *got.GatewayAuthEnabled != false {
		t.Errorf("GatewayAuthEnabled not preserved as false: got %v", got.GatewayAuthEnabled)
	}
}

func TestReadPlatformOptions_PreservesProjects(t *testing.T) {
	platformDir := t.TempDir()

	projects := map[string]string{
		"dit-1":     "/Users/x/dit-1",
		"figma-map": "/Users/x/figma-map",
	}
	if err := WritePlatformConfig(platformDir, Options{
		PlatformDir: platformDir,
		Projects:    projects,
	}); err != nil {
		t.Fatalf("WritePlatformConfig() error = %v", err)
	}

	got := ReadPlatformOptions(platformDir)
	if len(got.Projects) != len(projects) {
		t.Fatalf("Projects not preserved: got %v, want %v", got.Projects, projects)
	}
	for alias, path := range projects {
		if got.Projects[alias] != path {
			t.Errorf("Projects[%q] = %q, want %q", alias, got.Projects[alias], path)
		}
	}
}

// TestKBCreateUpdate_DoesNotDropProjects simulates the exact `kb-create update`
// sequence (ReadPlatformOptions of the existing file, then WritePlatformConfig
// with those options) to guard against the registry being silently wiped when
// the platform config is regenerated — the specific risk this feature had to
// solve (kb.config.jsonc is otherwise fully overwritten on every update).
func TestKBCreateUpdate_DoesNotDropProjects(t *testing.T) {
	platformDir := t.TempDir()

	if err := WritePlatformConfig(platformDir, Options{
		PlatformDir: platformDir,
		Projects:    map[string]string{"dit-1": "/Users/x/dit-1"},
	}); err != nil {
		t.Fatalf("initial WritePlatformConfig() error = %v", err)
	}

	// Simulate `kb-dev register` adding an alias between installer runs by
	// editing the file directly the way kb-dev's WriteProjects would (splicing
	// the sentinel block) — here we just re-write via the same Options path
	// kb-dev would end up producing, since this test lives in kb-create and
	// shouldn't depend on the kb-dev module.
	if err := WritePlatformConfig(platformDir, Options{
		PlatformDir: platformDir,
		Projects: map[string]string{
			"dit-1":     "/Users/x/dit-1",
			"figma-map": "/Users/x/figma-map",
		},
	}); err != nil {
		t.Fatalf("simulated kb-dev register error = %v", err)
	}

	// Now simulate `kb-create update`: read existing options, write them back.
	updateOpts := ReadPlatformOptions(platformDir)
	if err := WritePlatformConfig(platformDir, updateOpts); err != nil {
		t.Fatalf("simulated kb-create update error = %v", err)
	}

	final := ReadPlatformOptions(platformDir)
	if len(final.Projects) != 2 {
		t.Fatalf("kb-create update dropped projects: got %v", final.Projects)
	}
}

func TestWritePlatformConfig_GatewayDefaults(t *testing.T) {
	platformDir := t.TempDir()

	// No gateway options → production defaults: no host, no auth.enabled line.
	err := WritePlatformConfig(platformDir, Options{PlatformDir: platformDir})
	if err != nil {
		t.Fatalf("WritePlatformConfig() error = %v", err)
	}

	content := readKbConfig(t, platformDir)
	if strings.Contains(content, `"auth": { "enabled"`) {
		t.Error("auth.enabled must not be written when GatewayAuthEnabled is nil (production default)")
	}
	if strings.Contains(content, `"host": "127.0.0.1"`) {
		t.Error("loopback host must not be written when GatewayHost is empty")
	}
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

func TestWriteProjectConfig_MigratesLegacyJsonWithBackup(t *testing.T) {
	projectDir := t.TempDir()

	// Pre-create kb.config.json (not jsonc) — the dev config convention.
	kbDir := filepath.Join(projectDir, ".kb")
	if err := os.MkdirAll(kbDir, 0o750); err != nil {
		t.Fatal(err)
	}
	customContent := `{"platform":{"dir":"/old/path","custom":"keep"},"custom":{"enabled":true},"gateway":{"upstreams":{"legacy":{"serviceId":"missing","prefix":"/old"},"rest":{"serviceId":"rest","prefix":"/api/v1"},"duplicate":{"serviceId":"rest","prefix":"/api/v1"},"widgets":{"serviceId":"rest","prefix":"/plugins"}}}}`
	jsonPath := filepath.Join(kbDir, "kb.config.json")
	if err := os.WriteFile(jsonPath, []byte(customContent), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := WriteProjectConfig(projectDir, Options{PlatformDir: "/some/platform"}); !errors.Is(err, ErrIncompatibleLegacyConfig) {
		t.Fatalf("expected explicit confirmation error, got %v", err)
	}
	if err := WriteProjectConfig(projectDir, Options{PlatformDir: "/some/platform", AllowIncompatibleLegacyMigration: true}); err != nil {
		t.Fatal(err)
	}

	jsoncPath := filepath.Join(kbDir, "kb.config.jsonc")
	migrated, err := os.ReadFile(jsoncPath)
	if err != nil {
		t.Fatalf("migrated jsonc was not created: %v", err)
	}
	if !strings.Contains(string(migrated), `"dir": "/some/platform"`) || !strings.Contains(string(migrated), `"custom": "keep"`) || !strings.Contains(string(migrated), `"enabled": true`) {
		t.Errorf("migration did not preserve managed pointer and user fields: %s", migrated)
	}
	if strings.Contains(string(migrated), `"missing"`) || strings.Contains(string(migrated), `"prefix": "/old"`) || strings.Count(string(migrated), `"prefix": "/api/v1"`) != 1 {
		t.Errorf("migration did not remove stale/duplicate routes: %s", migrated)
	}
	if strings.Count(string(migrated), `"prefix": "/plugins"`) != 1 {
		t.Errorf("migration retained a duplicate /plugins route instead of using the generated route: %s", migrated)
	}
	if _, err := os.Stat(jsonPath); !os.IsNotExist(err) {
		t.Errorf("legacy json still exists after migration: %v", err)
	}
	backups, err := filepath.Glob(jsonPath + ".bak-*")
	if err != nil || len(backups) != 1 {
		t.Fatalf("expected one legacy config backup, got %v (%v)", backups, err)
	}
	backup, err := os.ReadFile(backups[0])
	if err != nil || string(backup) != customContent {
		t.Errorf("backup does not contain original config: %v", err)
	}
}

func TestWriteProjectConfig_MergesLegacyJsonWhenPointerJsoncAlreadyExists(t *testing.T) {
	projectDir := t.TempDir()
	kbDir := filepath.Join(projectDir, ".kb")
	if err := os.MkdirAll(kbDir, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(kbDir, "kb.config.jsonc"), []byte(`{"platform":{"dir":"/generated/platform"},"profiles":["rest"]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	legacy := `{"platform":{"adapters":{"llm":"@kb-labs/adapters-openai","vectorStore":"@kb-labs/adapters-qdrant"},"adapterOptions":{"llm":{"defaultTier":"small"}}},"custom":{"keep":true}}`
	jsonPath := filepath.Join(kbDir, "kb.config.json")
	if err := os.WriteFile(jsonPath, []byte(legacy), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := WriteProjectConfig(projectDir, Options{PlatformDir: "/selected/platform"}); err != nil {
		t.Fatalf("WriteProjectConfig: %v", err)
	}
	migrated := readKbConfig(t, projectDir)
	for _, want := range []string{
		`"dir": "/selected/platform"`,
		`"llm": "@kb-labs/adapters-openai"`,
		`"vectorStore": "@kb-labs/adapters-qdrant"`,
		`"defaultTier": "small"`,
		`"keep": true`,
		`"profiles": [`,
	} {
		if !strings.Contains(migrated, want) {
			t.Errorf("merged config missing %q:\n%s", want, migrated)
		}
	}
	if _, err := os.Stat(jsonPath); !os.IsNotExist(err) {
		t.Errorf("legacy json still exists after migration: %v", err)
	}
	if backups, err := filepath.Glob(jsonPath + ".bak-*"); err != nil || len(backups) != 1 {
		t.Fatalf("expected one legacy config backup, got %v (%v)", backups, err)
	}
}

func TestStripGeneratedJsoncPreservesCommentMarkersInStrings(t *testing.T) {
	input := `{"scope":"sites/**","url":"http://localhost:5050",/* comment */"enabled":true}`
	var got map[string]any
	if err := json.Unmarshal([]byte(stripGeneratedJsonc(input)), &got); err != nil {
		t.Fatalf("stripGeneratedJsonc produced invalid JSON: %v", err)
	}
	if got["scope"] != "sites/**" || got["url"] != "http://localhost:5050" {
		t.Fatalf("comment-like string values were corrupted: %#v", got)
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
		Catalog:     testCatalog(),
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
		`"storage": "@kb-labs/data-store"`,
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
		Catalog:     testCatalog(),
	})

	assertContains(t, content, `"vectorStore"`, "mind inner config")
	assertContains(t, content, `"maxSteps"`, "agents inner config")
	assertContains(t, content, `"mode": "full"`, "ai-review inner config")
	assertContains(t, content, `"autoStage"`, "commit inner config")
}

func TestGenerateFull_GatewayUpstreams(t *testing.T) {
	content := generateFull(Options{PlatformDir: "/x"})

	assertContains(t, content, `"gateway"`, "gateway section")
	assertContains(t, content, `"serviceTransport"`, "serviceTransport in adapterOptions")
	assertContains(t, content, `"services"`, "transport services map")
	assertContains(t, content, `"upstreams"`, "upstreams block")
	assertContains(t, content, `"serviceId"`, "serviceId in upstream")
	assertContains(t, content, `"rest"`, "rest upstream")
	assertContains(t, content, `http://127.0.0.1:5050`, "REST URL in transport")
	assertContains(t, content, `"workflow"`, "workflow upstream")
	assertContains(t, content, `http://127.0.0.1:7778`, "workflow URL in transport")
	assertContains(t, content, `"marketplace"`, "marketplace upstream")
	assertContains(t, content, `http://127.0.0.1:5070`, "marketplace URL in transport")
	assertContains(t, content, `"widgets"`, "widgets upstream")

	// stripGeneratedJsonc must not corrupt URLs (//[^\n]* must not eat into http://)
	stripped := stripGeneratedJsonc(content)
	if !strings.Contains(stripped, "http://127.0.0.1:5050") {
		t.Error("stripGeneratedJsonc corrupted http://127.0.0.1:5050 URL in gateway section")
	}
	if !strings.Contains(stripped, "http://127.0.0.1:7778") {
		t.Error("stripGeneratedJsonc corrupted http://127.0.0.1:7778 URL in gateway section")
	}
	if !strings.Contains(stripped, "http://127.0.0.1:5070") {
		t.Error("stripGeneratedJsonc corrupted http://127.0.0.1:5070 URL in gateway section")
	}
}

// TestGenerateFull_DynamicGatewayPlan verifies that a discovery-derived plan is
// rendered verbatim into the config — the dynamic upstreams/transport reach the
// single platform config instead of being discarded (the bug this refactor fixed).
func TestGenerateFull_DynamicGatewayPlan(t *testing.T) {
	rewrite := ""
	plan := &gateway.Plan{
		Gateway: gateway.Config{
			Port: 4000,
			Upstreams: map[string]gateway.Upstream{
				"analytics": {ServiceID: "analytics", Prefix: "/api/analytics", RewritePrefix: &rewrite, WebSocket: true},
			},
		},
		Transport: map[string]gateway.TransportService{
			"analytics": {URL: "http://127.0.0.1:9123"},
		},
	}

	content := generateFull(Options{PlatformDir: "/x", Gateway: plan})

	assertContains(t, content, `"analytics"`, "custom upstream id")
	assertContains(t, content, `"/api/analytics"`, "custom upstream prefix")
	assertContains(t, content, `http://127.0.0.1:9123`, "custom transport URL")
	// The default rest/workflow upstreams must NOT appear — the plan is authoritative.
	if strings.Contains(content, `"/api/exec"`) {
		t.Error("custom plan must replace defaults, but default workflow upstream leaked in")
	}

	assertValidJSONC(t, content)
}

// TestGenerateFull_ValidJSONC ensures the generated config parses as JSON after
// comment stripping — guards the dynamic comma placement in the rendered maps.
func TestGenerateFull_ValidJSONC(t *testing.T) {
	content := generateFull(Options{
		PlatformDir: "/x",
		Services:    []string{"rest", "workflow"},
		Plugins:     []string{"mind"},
	})
	assertValidJSONC(t, content)
}

// assertValidJSONC strips JSONC comments and trailing commas, then parses as
// JSON, failing with context if the result is not valid.
func assertValidJSONC(t *testing.T, content string) {
	t.Helper()
	stripped := stripGeneratedJsonc(content)
	var v any
	if err := json.Unmarshal([]byte(stripped), &v); err != nil {
		t.Fatalf("generated config is not valid JSON after comment stripping: %v\n--- stripped ---\n%s", err, stripped)
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

// ── LLM provider .env (B-001 replacement) ─────────────────────────────────

// TestWriteProjectConfig_LLMProviderOpenAI verifies that when LLMProvider=openai
// and LLMKey is set, the project .env gets OPENAI_API_KEY (not gateway creds).
// Before the fix LLMProvider/LLMKey fields did not exist and the gateway
// auto-registration path was taken, always failing with 401.
func TestWriteProjectConfig_LLMProviderOpenAI(t *testing.T) {
	platformDir := t.TempDir()
	projectDir := t.TempDir()

	opts := Options{
		PlatformDir: platformDir,
		LLMProvider: "openai",
		LLMKey:      "sk-test-openai-key",
	}
	if err := WriteProjectConfig(projectDir, opts); err != nil {
		t.Fatalf("WriteProjectConfig: %v", err)
	}

	env, err := os.ReadFile(filepath.Join(projectDir, ".env"))
	if err != nil {
		t.Fatalf("read .env: %v", err)
	}
	content := string(env)
	if !strings.Contains(content, "OPENAI_API_KEY=sk-test-openai-key") {
		t.Errorf(".env should contain OPENAI_API_KEY, got:\n%s", content)
	}
	if strings.Contains(content, "KB_GATEWAY_CLIENT_ID") {
		t.Errorf(".env should NOT contain gateway credentials for openai provider, got:\n%s", content)
	}
}

// TestWriteProjectConfig_LLMProviderAnthropic verifies Anthropic key ends up
// as ANTHROPIC_API_KEY in .env.
func TestWriteProjectConfig_LLMProviderAnthropic(t *testing.T) {
	platformDir := t.TempDir()
	projectDir := t.TempDir()

	opts := Options{
		PlatformDir: platformDir,
		LLMProvider: "anthropic",
		LLMKey:      "sk-ant-test-key",
	}
	if err := WriteProjectConfig(projectDir, opts); err != nil {
		t.Fatalf("WriteProjectConfig: %v", err)
	}

	env, err := os.ReadFile(filepath.Join(projectDir, ".env"))
	if err != nil {
		t.Fatalf("read .env: %v", err)
	}
	content := string(env)
	if !strings.Contains(content, "ANTHROPIC_API_KEY=sk-ant-test-key") {
		t.Errorf(".env should contain ANTHROPIC_API_KEY, got:\n%s", content)
	}
}

// TestWriteProjectConfig_LLMProviderSkip verifies that with no LLMProvider
// no .env is written — no credentials, no gateway, nothing.
func TestWriteProjectConfig_LLMProviderSkip(t *testing.T) {
	platformDir := t.TempDir()
	projectDir := t.TempDir()

	opts := Options{
		PlatformDir: platformDir,
		LLMProvider: "",
		LLMKey:      "",
	}
	if err := WriteProjectConfig(projectDir, opts); err != nil {
		t.Fatalf("WriteProjectConfig: %v", err)
	}

	envPath := filepath.Join(projectDir, ".env")
	data, err := os.ReadFile(envPath)
	if err != nil && !os.IsNotExist(err) {
		t.Fatalf("unexpected error reading .env: %v", err)
	}
	content := string(data)
	if strings.Contains(content, "_API_KEY") || strings.Contains(content, "KB_GATEWAY") {
		t.Errorf(".env should be empty or absent when LLM skipped, got:\n%s", content)
	}
}

// TestEnsureGitignore_ExcludesClaudeDir verifies .gitignore excludes .claude/,
// which the commit plugin refuses to commit anyway — a plain `git add -A` on a
// fresh project should not stage Claude Code assets in the first place.
func TestEnsureGitignore_ExcludesClaudeDir(t *testing.T) {
	projectDir := t.TempDir()

	if err := ensureGitignore(projectDir); err != nil {
		t.Fatalf("ensureGitignore: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(projectDir, ".gitignore"))
	if err != nil {
		t.Fatalf("read .gitignore: %v", err)
	}
	if !strings.Contains(string(data), ".claude/") {
		t.Errorf(".gitignore should exclude .claude/, got:\n%s", string(data))
	}
}

// TestEnsureGitignore_ExcludesScaffoldedPluginBuildOutput verifies .gitignore
// excludes .kb/plugins/*/node_modules and dist. Without this, the documented
// `kb scaffold run plugin demo` → pnpm install → pnpm build → git add -A flow
// stages the entire scaffolded plugin's node_modules (tens of thousands of
// files), which can also make the no-LLM commit planner assign one of those
// files to two different commit groups and self-abort.
func TestEnsureGitignore_ExcludesScaffoldedPluginBuildOutput(t *testing.T) {
	projectDir := t.TempDir()

	if err := ensureGitignore(projectDir); err != nil {
		t.Fatalf("ensureGitignore: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(projectDir, ".gitignore"))
	if err != nil {
		t.Fatalf("read .gitignore: %v", err)
	}
	content := string(data)
	for _, want := range []string{".kb/plugins/*/node_modules/", ".kb/plugins/*/dist/"} {
		if !strings.Contains(content, want) {
			t.Errorf(".gitignore should exclude scaffolded plugin build output %q, got:\n%s", want, content)
		}
	}
}

func TestEnsureGitignore_UpdatesExistingKBBlockIdempotently(t *testing.T) {
	projectDir := t.TempDir()
	path := filepath.Join(projectDir, ".gitignore")
	initial := "node_modules/\n\n# kb-labs-ignore\n.env\n.kb/logs/\n# end-kb-labs-ignore\nkeep-me\n"
	if err := os.WriteFile(path, []byte(initial), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := ensureGitignore(projectDir); err != nil {
		t.Fatalf("first ensureGitignore: %v", err)
	}
	first, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"*.log", ".kb/runtime/", ".kb/database/", "keep-me"} {
		if !strings.Contains(string(first), want) {
			t.Errorf("updated .gitignore missing %q:\n%s", want, first)
		}
	}
	if err := ensureGitignore(projectDir); err != nil {
		t.Fatalf("second ensureGitignore: %v", err)
	}
	second, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(first) != string(second) {
		t.Errorf("ensureGitignore is not idempotent\nfirst=%q\nsecond=%q", string(first), string(second))
	}
}

// TestWriteStarterWorkflows_RunCommentsUseWorkflowIdFlag verifies the "Run:"
// comment in each generated starter workflow uses the actual `kb workflow run`
// CLI syntax (`--workflow-id <id>`). `workflow:run` (plugins/workflow/entry/src/
// commands/workflow-run.ts) requires --workflow-id and does not accept a
// positional argument, so a comment reading "kb workflow run healthcheck" fails
// immediately with "Missing required flag: --workflow-id" for a new user who
// copies it verbatim.
func TestWriteStarterWorkflows_RunCommentsUseWorkflowIdFlag(t *testing.T) {
	kbDir := t.TempDir()

	if err := writeStarterWorkflows(kbDir); err != nil {
		t.Fatalf("writeStarterWorkflows: %v", err)
	}

	entries, err := os.ReadDir(filepath.Join(kbDir, "workflows"))
	if err != nil {
		t.Fatalf("read workflows dir: %v", err)
	}
	if len(entries) == 0 {
		t.Fatal("expected starter workflows to be written")
	}

	for _, e := range entries {
		data, err := os.ReadFile(filepath.Join(kbDir, "workflows", e.Name()))
		if err != nil {
			t.Fatalf("read %s: %v", e.Name(), err)
		}
		for _, line := range strings.Split(string(data), "\n") {
			if strings.Contains(line, "kb workflow run") && !strings.Contains(line, "--workflow-id") {
				t.Errorf("%s: %q uses `kb workflow run <id>` without --workflow-id, which the CLI rejects", e.Name(), strings.TrimSpace(line))
			}
		}
	}
}

func TestWriteStarterWorkflows_HealthcheckSupportsProjectsWithoutPackageJSON(t *testing.T) {
	kbDir := t.TempDir()

	if err := writeStarterWorkflows(kbDir); err != nil {
		t.Fatalf("writeStarterWorkflows: %v", err)
	}

	healthcheck, err := os.ReadFile(filepath.Join(kbDir, "workflows", "healthcheck.yaml"))
	if err != nil {
		t.Fatalf("read healthcheck: %v", err)
	}
	content := string(healthcheck)
	for _, expected := range []string{
		"if [ -f package.json ]; then",
		"if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install; fi",
		"pnpm run build --if-present",
		"pnpm run lint --if-present",
		"pnpm run test --if-present",
	} {
		if !strings.Contains(content, expected) {
			t.Errorf("healthcheck is missing project-safe command %q", expected)
		}
	}
}

func TestWriteStarterWorkflows_ScheduledReportUsesWorkflowTriggerSchema(t *testing.T) {
	kbDir := t.TempDir()

	if err := writeStarterWorkflows(kbDir); err != nil {
		t.Fatalf("writeStarterWorkflows: %v", err)
	}

	report, err := os.ReadFile(filepath.Join(kbDir, "workflows", "scheduled-report.yaml"))
	if err != nil {
		t.Fatalf("read scheduled-report: %v", err)
	}
	content := string(report)
	if !strings.Contains(content, "schedule:\n    cron: \"0 9 * * 1-5\"") {
		t.Errorf("scheduled-report must use object trigger schema, got:\n%s", content)
	}
	if strings.Contains(content, "schedule: \"0 9 * * 1-5\"") {
		t.Error("scheduled-report still uses the legacy string schedule shape")
	}
}

// TestWriteDemoWorkflow_RunCommentUsesWorkflowIdFlag mirrors
// TestWriteStarterWorkflows_RunCommentsUseWorkflowIdFlag for the --demo-only
// demo.yaml (written by writeDemoWorkflow, not writeStarterWorkflows): its
// "Run:" comment previously read "kb run demo" — not a real command at all
// (the group is `kb workflow run`, not `kb run`) — and its "Edit:" comment
// pointed at a nonexistent `kb workflow edit` command.
func TestWriteDemoWorkflow_RunCommentUsesWorkflowIdFlag(t *testing.T) {
	kbDir := t.TempDir()

	if err := writeDemoWorkflow(kbDir); err != nil {
		t.Fatalf("writeDemoWorkflow: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(kbDir, "workflows", "demo.yaml"))
	if err != nil {
		t.Fatalf("read demo.yaml: %v", err)
	}

	for _, line := range strings.Split(string(data), "\n") {
		if strings.Contains(line, "kb workflow edit") {
			t.Errorf("demo.yaml: %q references `kb workflow edit`, which is not a registered command", strings.TrimSpace(line))
		}
		if strings.Contains(line, "kb run ") {
			t.Errorf("demo.yaml: %q references `kb run <id>`, which is not a registered command group", strings.TrimSpace(line))
		}
		if strings.Contains(line, "kb workflow run") && !strings.Contains(line, "--workflow-id") {
			t.Errorf("demo.yaml: %q uses `kb workflow run <id>` without --workflow-id, which the CLI rejects", strings.TrimSpace(line))
		}
	}
}

// ── Adapters: overrides, cache, catalog-driven rendering (ADR-0026 I5/I6) ────

func TestGenerateFull_AdapterOverrides(t *testing.T) {
	content := generateFull(Options{
		PlatformDir: "/x",
		Adapters:    map[string]string{"storage": "@acme/adapters-s3@1.2.3"},
	})

	assertContains(t, content, `"storage": "@acme/adapters-s3@1.2.3"`, "storage override applied")
	if strings.Contains(content, `"storage": "@kb-labs/data-store"`) {
		t.Error("storage default should not appear when overridden")
	}
	// Unrelated defaults must be untouched by the override.
	assertContains(t, content, `"logger": "@kb-labs/adapters-pino"`, "logger keeps its default")
}

func TestGenerateFull_CacheOnlyWhenSet(t *testing.T) {
	withoutCache := generateFull(Options{PlatformDir: "/x"})
	if strings.Contains(withoutCache, `"cache"`) {
		t.Error("cache should not render at all with no override — there is no built-in default")
	}

	withCache := generateFull(Options{
		PlatformDir: "/x",
		Adapters:    map[string]string{"cache": "@kb-labs/adapters-redis@0.2.0"},
	})
	assertContains(t, withCache, `"cache": "@kb-labs/adapters-redis@0.2.0"`, "cache override applied")
}

func TestGenerateFull_NilCatalogRendersEmptyToggleBlocks(t *testing.T) {
	content := generateFull(Options{PlatformDir: "/x", Services: []string{"rest"}, Plugins: []string{"mind"}})

	assertContains(t, content, `"services": {`, "services block still present")
	assertContains(t, content, `"plugins": {`, "plugins block still present")
	if strings.Contains(content, `"rest": true`) {
		t.Error("with no Catalog, no service toggles should render at all, even if Services lists one")
	}
	if strings.Contains(content, `"mind":`) {
		t.Error("with no Catalog, no plugin blocks should render at all, even if Plugins lists one")
	}
}

func TestGenerateFull_CatalogDrivenServicesSkipsGateway(t *testing.T) {
	content := generateFull(Options{PlatformDir: "/x", Catalog: testCatalog()})

	assertContains(t, content, `"rest": false`, "rest rendered from catalog")
	assertContains(t, content, `"marketplace": false`, "marketplace rendered from catalog (was previously missing — I5)")
	if strings.Contains(content, `"gateway": false`) || strings.Contains(content, `"gateway": true`) {
		t.Error("gateway has its own dedicated config section and must not get a generic services toggle")
	}
}

func TestGenerateFull_AdapterConfigFromCatalogOverridesFallback(t *testing.T) {
	catalog := testCatalog()
	catalog.AdapterConfig = &manifest.AdapterConfig{
		Adapters: map[string]string{"storage": "@acme/adapters-gcs@2.0.0"},
	}

	content := generateFull(Options{PlatformDir: "/x", Catalog: catalog})

	assertContains(t, content, `"storage": "@acme/adapters-gcs@2.0.0"`, "manifest.json AdapterConfig default applied")
}

func TestGenerateFull_CLIAdapterOverrideWinsOverCatalogConfig(t *testing.T) {
	catalog := testCatalog()
	catalog.AdapterConfig = &manifest.AdapterConfig{
		Adapters: map[string]string{"storage": "@acme/adapters-gcs@2.0.0"},
	}

	content := generateFull(Options{
		PlatformDir: "/x",
		Catalog:     catalog,
		Adapters:    map[string]string{"storage": "@acme/adapters-s3@1.0.0"},
	})

	assertContains(t, content, `"storage": "@acme/adapters-s3@1.0.0"`, "--adapters CLI override wins over catalog config")
	if strings.Contains(content, "@acme/adapters-gcs") {
		t.Error("catalog config default should be fully shadowed by the CLI override")
	}
}

func TestGenerateFull_CatalogDrivenPluginsRenderAll(t *testing.T) {
	content := generateFull(Options{PlatformDir: "/x", Catalog: testCatalog()})

	// release has no custom inner config — must still render with just enabled, no trailing-comma break.
	assertContains(t, content, `"release": {`, "release plugin block rendered")
	assertContains(t, content, `"vectorStore"`, "mind's custom inner config still present")
}
