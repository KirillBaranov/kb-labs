package scan

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// setupFakePlatform creates a minimal node_modules with kb.manifest packages.
func setupFakePlatform(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	nm := filepath.Join(dir, "node_modules")

	// Plugin: @test/my-plugin with kb.manifest → dist/manifest.js
	pluginDir := filepath.Join(nm, "@test", "my-plugin")
	writeJSON(t, filepath.Join(pluginDir, "package.json"), map[string]any{
		"name":    "@test/my-plugin",
		"version": "1.0.0",
		"kb":      map[string]any{"manifest": "./dist/manifest.js"},
	})
	writeFile(t, filepath.Join(pluginDir, "dist", "manifest.js"), `
		module.exports.manifest = {
			schema: "kb.plugin/3",
			id: "@test/my-plugin",
			version: "1.0.0",
			display: { name: "My Plugin", description: "Test plugin" },
			cli: { commands: [{ id: "test:hello", describe: "Say hello", handler: "./dist/hello.js" }] },
		};
	`)

	// Adapter: @test/my-adapter with kb.manifest → dist/manifest.js
	adapterDir := filepath.Join(nm, "@test", "my-adapter")
	writeJSON(t, filepath.Join(adapterDir, "package.json"), map[string]any{
		"name":    "@test/my-adapter",
		"version": "2.0.0",
		"kb":      map[string]any{"manifest": "./dist/manifest.js"},
	})
	writeFile(t, filepath.Join(adapterDir, "dist", "manifest.js"), `
		module.exports.manifest = {
			manifestVersion: "1.0.0",
			id: "test-cache",
			name: "Test Cache",
			version: "2.0.0",
			implements: "ICache",
			type: "core",
		};
	`)

	// Service: cool-service with kb.manifest → dist/manifest.js
	svcDir := filepath.Join(nm, "cool-service")
	writeJSON(t, filepath.Join(svcDir, "package.json"), map[string]any{
		"name":    "cool-service",
		"version": "0.5.0",
		"kb":      map[string]any{"manifest": "./dist/manifest.js"},
	})
	writeFile(t, filepath.Join(svcDir, "dist", "manifest.js"), `
		module.exports.manifest = {
			schema: "kb.service/1",
			id: "cool",
			name: "Cool Service",
			version: "0.5.0",
			description: "A cool service",
			runtime: { entry: "dist/index.js", port: 9090, healthCheck: "/health" },
			dependsOn: [],
		};
	`)

	// Non-kb package (should be ignored)
	plainDir := filepath.Join(nm, "lodash")
	writeJSON(t, filepath.Join(plainDir, "package.json"), map[string]any{
		"name":    "lodash",
		"version": "4.17.21",
	})

	return dir
}

func writeJSON(t *testing.T, path string, data any) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		t.Fatal(err)
	}
	b, err := json.Marshal(data)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, b, 0o600); err != nil {
		t.Fatal(err)
	}
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

// TestScanFindsEntities verifies that the scanner discovers plugins, adapters, and services.
func TestScanFindsEntities(t *testing.T) {
	if _, err := os.Stat("/usr/local/bin/node"); err != nil {
		// Also check PATH
		if _, err := lookPath("node"); err != nil {
			t.Skip("node not found in PATH, skipping scan test")
		}
	}

	dir := setupFakePlatform(t)
	result, err := Run(dir)
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}

	// Plugin
	if len(result.Plugins) != 1 {
		t.Fatalf("expected 1 plugin, got %d: %+v", len(result.Plugins), result.Plugins)
	}
	if result.Plugins[0].ID != "@test/my-plugin" {
		t.Errorf("plugin ID = %q, want @test/my-plugin", result.Plugins[0].ID)
	}
	if result.Plugins[0].PrimaryKind != "plugin" {
		t.Errorf("plugin PrimaryKind = %q, want plugin", result.Plugins[0].PrimaryKind)
	}
	// Should have cli-command in provides
	hasCliCmd := false
	for _, p := range result.Plugins[0].Provides {
		if p == "cli-command" {
			hasCliCmd = true
		}
	}
	if !hasCliCmd {
		t.Errorf("plugin provides = %v, want cli-command in list", result.Plugins[0].Provides)
	}

	// Adapter
	if len(result.Adapters) != 1 {
		t.Fatalf("expected 1 adapter, got %d: %+v", len(result.Adapters), result.Adapters)
	}
	if result.Adapters[0].ID != "test-cache" {
		t.Errorf("adapter ID = %q, want test-cache", result.Adapters[0].ID)
	}
	if result.Adapters[0].Implements != "ICache" {
		t.Errorf("adapter Implements = %q, want ICache", result.Adapters[0].Implements)
	}

	// Service
	if len(result.Services) != 1 {
		t.Fatalf("expected 1 service, got %d: %+v", len(result.Services), result.Services)
	}
	if result.Services[0].ID != "cool" {
		t.Errorf("service ID = %q, want cool", result.Services[0].ID)
	}
	if result.Services[0].Runtime.Port != 9090 {
		t.Errorf("service port = %d, want 9090", result.Services[0].Runtime.Port)
	}
	if result.Services[0].Runtime.HealthCheck != "/health" {
		t.Errorf("service healthCheck = %q, want /health", result.Services[0].Runtime.HealthCheck)
	}
}

// TestScanIgnoresNonKBPackages verifies that packages without kb.manifest are skipped.
func TestScanIgnoresNonKBPackages(t *testing.T) {
	if _, err := lookPath("node"); err != nil {
		t.Skip("node not found in PATH, skipping scan test")
	}

	dir := t.TempDir()
	nm := filepath.Join(dir, "node_modules")
	plainDir := filepath.Join(nm, "express")
	writeJSON(t, filepath.Join(plainDir, "package.json"), map[string]any{
		"name":    "express",
		"version": "4.18.0",
	})

	result, err := Run(dir)
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if len(result.Plugins)+len(result.Adapters)+len(result.Services) != 0 {
		t.Errorf("expected 0 entities, got plugins=%d adapters=%d services=%d",
			len(result.Plugins), len(result.Adapters), len(result.Services))
	}
}

// TestGenerateMarketplaceLock verifies lock generation from scan results.
func TestGenerateMarketplaceLock(t *testing.T) {
	r := &ScanResult{
		Plugins: []PluginEntry{{
			ID: "@test/foo", Version: "1.0.0", ResolvedPath: "./node_modules/@test/foo",
			PrimaryKind: "plugin", Provides: []string{"plugin", "cli-command"},
		}},
		Adapters: []AdapterEntry{{
			ID: "bar-cache", Version: "2.0.0", ResolvedPath: "./node_modules/bar-cache",
			Implements: "ICache",
		}},
	}

	lock := GenerateMarketplaceLock(r, "/tmp/test")
	if lock.Schema != "kb.marketplace/2" {
		t.Errorf("schema = %q, want kb.marketplace/2", lock.Schema)
	}
	if len(lock.Installed) != 2 {
		t.Fatalf("installed = %d, want 2", len(lock.Installed))
	}
	if e, ok := lock.Installed["@test/foo"]; !ok {
		t.Error("@test/foo not in lock")
	} else if e.PrimaryKind != "plugin" {
		t.Errorf("@test/foo primaryKind = %q, want plugin", e.PrimaryKind)
	}
	if e, ok := lock.Installed["bar-cache"]; !ok {
		t.Error("bar-cache not in lock")
	} else if e.PrimaryKind != "adapter" {
		t.Errorf("bar-cache primaryKind = %q, want adapter", e.PrimaryKind)
	}
}

// TestGenerateDevServicesYAML verifies YAML config generation from scan results.
//
// Services declaring a dependency on another service that was NOT found
// during scan (e.g. docker-only services like qdrant, or optional deps)
// must have that dependency dropped — otherwise `kb-dev start` rejects
// the whole config as invalid. See internal/scan.filterKnownDeps.
func TestGenerateDevServicesYAML(t *testing.T) {
	r := &ScanResult{
		Services: []ServiceEntry{{
			ID: "api", Name: "API Server", Version: "1.0.0",
			ResolvedPath: "./node_modules/@test/api",
			Runtime:      ServiceRuntime{Entry: "dist/index.js", Port: 3000, HealthCheck: "/health"},
			// "db" is not in r.Services — filterKnownDeps must drop it.
			DependsOn: []string{"db"},
		}},
	}

	yaml := GenerateDevServicesYAML(r)

	if !strings.Contains(yaml, "api:") {
		t.Error("YAML should contain service 'api'")
	}
	if !strings.Contains(yaml, "port: 3000") {
		t.Error("YAML should contain port 3000")
	}
	if !strings.Contains(yaml, "health_check: http://localhost:3000/health") {
		t.Errorf("YAML should contain health_check URL, got:\n%s", yaml)
	}
	if !strings.Contains(yaml, "command: node ./node_modules/@test/api/dist/index.js") {
		t.Error("YAML should contain command")
	}
	// Unknown "db" dep must be filtered out so kb-dev accepts the config.
	if strings.Contains(yaml, "depends_on") {
		t.Errorf("YAML should not contain depends_on (unknown dep should be filtered), got:\n%s", yaml)
	}
}

// TestGenerateDevServicesYAML_KeepsKnownDeps verifies that when a dependency
// target IS present in the scan, the depends_on reference is preserved.
func TestGenerateDevServicesYAML_KeepsKnownDeps(t *testing.T) {
	r := &ScanResult{
		Services: []ServiceEntry{
			{
				ID: "state-daemon", Name: "State Daemon", Version: "1.0.0",
				ResolvedPath: "./node_modules/@test/state",
				Runtime:      ServiceRuntime{Entry: "dist/bin.js", Port: 7777, HealthCheck: "/health"},
			},
			{
				ID: "rest", Name: "REST API", Version: "1.0.0",
				ResolvedPath: "./node_modules/@test/rest",
				Runtime:      ServiceRuntime{Entry: "dist/index.js", Port: 5050, HealthCheck: "/health"},
				// state-daemon IS in scan result — dep must be preserved.
				// qdrant is NOT in scan result — must be dropped.
				DependsOn: []string{"state-daemon", "qdrant"},
			},
		},
	}

	yaml := GenerateDevServicesYAML(r)

	if !strings.Contains(yaml, "depends_on: [state-daemon]") {
		t.Errorf("YAML should contain depends_on with state-daemon only, got:\n%s", yaml)
	}
	if strings.Contains(yaml, "qdrant") {
		t.Error("YAML should not contain qdrant (unknown dep should be filtered)")
	}
}

// TestGenerateDevServicesYAML_EmptyServices verifies YAML for empty service list.
func TestGenerateDevServicesYAML_EmptyServices(t *testing.T) {
	r := &ScanResult{}
	yaml := GenerateDevServicesYAML(r)

	if !strings.Contains(yaml, "name: KB Labs Platform") {
		t.Error("YAML should contain header")
	}
	if !strings.Contains(yaml, "settings:") {
		t.Error("YAML should contain settings section")
	}
}

// TestComputeIntegrity verifies SRI hash computation.
func TestComputeIntegrity(t *testing.T) {
	dir := t.TempDir()
	pkgDir := filepath.Join(dir, "my-pkg")
	if err := os.MkdirAll(pkgDir, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(pkgDir, "package.json"), []byte(`{"name":"test"}`), 0o600); err != nil {
		t.Fatal(err)
	}

	integrity := computeIntegrity(dir, "my-pkg")
	if !strings.HasPrefix(integrity, "sha256-") {
		t.Errorf("integrity = %q, want sha256- prefix", integrity)
	}
	if len(integrity) < 10 {
		t.Errorf("integrity too short: %q", integrity)
	}

	// Deterministic
	integrity2 := computeIntegrity(dir, "my-pkg")
	if integrity != integrity2 {
		t.Errorf("not deterministic: %q != %q", integrity, integrity2)
	}
}

// TestComputeIntegrity_MissingFile returns empty string for missing package.json.
func TestComputeIntegrity_MissingFile(t *testing.T) {
	integrity := computeIntegrity(t.TempDir(), "nonexistent")
	if integrity != "" {
		t.Errorf("integrity = %q, want empty for missing file", integrity)
	}
}

// TestWriteConfigs verifies that WriteConfigs creates both config files.
func TestWriteConfigs(t *testing.T) {
	dir := t.TempDir()

	// Create fake package.json for integrity computation
	pluginDir := filepath.Join(dir, "node_modules", "@test", "foo")
	if err := os.MkdirAll(pluginDir, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(pluginDir, "package.json"), []byte(`{"name":"@test/foo"}`), 0o600); err != nil {
		t.Fatal(err)
	}

	r := &ScanResult{
		Plugins: []PluginEntry{{
			ID: "@test/foo", Version: "1.0.0",
			ResolvedPath: "node_modules/@test/foo",
			PrimaryKind:  "plugin",
			Provides:     []string{"plugin"},
		}},
		Services: []ServiceEntry{{
			ID: "api", Name: "API", Version: "1.0.0",
			ResolvedPath: "./node_modules/@test/api",
			Runtime:      ServiceRuntime{Entry: "dist/index.js", Port: 3000, HealthCheck: "/health"},
		}},
	}

	if err := WriteConfigs(dir, r); err != nil {
		t.Fatalf("WriteConfigs() error = %v", err)
	}

	// Check marketplace.lock exists
	lockPath := filepath.Join(dir, ".kb", "marketplace.lock")
	if _, err := os.Stat(lockPath); err != nil {
		t.Errorf("marketplace.lock not created: %v", err)
	}

	// Check devservices.yaml exists
	yamlPath := filepath.Join(dir, ".kb", "devservices.yaml")
	if _, err := os.Stat(yamlPath); err != nil {
		t.Errorf("devservices.yaml not created: %v", err)
	}
}

// TestFilterKnownDeps_EmptyResultIsNil ensures the filter returns nil
// (not an empty slice) so the `omitempty` JSON tag removes the field entirely.
func TestFilterKnownDeps_EmptyResultIsNil(t *testing.T) {
	known := map[string]struct{}{"a": {}, "b": {}}

	if got := filterKnownDeps(nil, known); got != nil {
		t.Errorf("nil input: got %v, want nil", got)
	}
	if got := filterKnownDeps([]string{}, known); got != nil {
		t.Errorf("empty input: got %v, want nil", got)
	}
	if got := filterKnownDeps([]string{"x", "y"}, known); got != nil {
		t.Errorf("all-unknown input: got %v, want nil", got)
	}
	if got := filterKnownDeps([]string{"a", "x"}, known); len(got) != 1 || got[0] != "a" {
		t.Errorf("mixed input: got %v, want [a]", got)
	}
}

// lookPath is a test helper wrapping exec.LookPath.
func lookPath(name string) (string, error) {
	return exec.LookPath(name)
}
