package pm

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestDetectReturnsNonNil verifies that Detect always returns a non-nil manager.
func TestDetectReturnsNonNil(t *testing.T) {
	mgr := Detect()
	if mgr == nil {
		t.Fatal("Detect() returned nil")
	}
	if mgr.Name() == "" {
		t.Error("Detect() returned manager with empty Name()")
	}
}

// TestDetectNameIsKnown verifies the detected manager name is either "npm" or "pnpm".
func TestDetectNameIsKnown(t *testing.T) {
	mgr := Detect()
	name := mgr.Name()
	if name != "npm" && name != "pnpm" {
		t.Errorf("Detect() name = %q, want \"npm\" or \"pnpm\"", name)
	}
}

// TestNpmManagerName verifies NpmManager.Name returns "npm".
func TestNpmManagerName(t *testing.T) {
	n := &NpmManager{}
	if got := n.Name(); got != "npm" {
		t.Errorf("NpmManager.Name() = %q, want \"npm\"", got)
	}
}

// TestPnpmManagerName verifies PnpmManager.Name returns "pnpm".
func TestPnpmManagerName(t *testing.T) {
	p := &PnpmManager{}
	if got := p.Name(); got != "pnpm" {
		t.Errorf("PnpmManager.Name() = %q, want \"pnpm\"", got)
	}
}

// TestEnsurePackageJSONCreates verifies that ensurePackageJSON creates package.json
// if it does not exist.
func TestEnsurePackageJSONCreates(t *testing.T) {
	dir := t.TempDir()
	pkgPath := filepath.Join(dir, "package.json")

	if err := ensurePackageJSON(dir); err != nil {
		t.Fatalf("ensurePackageJSON() error = %v", err)
	}

	info, err := os.Stat(pkgPath)
	if err != nil {
		t.Fatalf("package.json not created: %v", err)
	}
	if info.Size() == 0 {
		t.Error("package.json is empty")
	}
}

// TestEnsurePackageJSONMergesOverrides verifies that ensurePackageJSON always
// injects pnpm.overrides into an existing package.json while preserving
// other fields (name, version, etc.).
func TestEnsurePackageJSONMergesOverrides(t *testing.T) {
	dir := t.TempDir()
	pkgPath := filepath.Join(dir, "package.json")

	custom := `{"name":"custom","version":"9.9.9"}` + "\n"
	if err := os.WriteFile(pkgPath, []byte(custom), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := ensurePackageJSON(dir); err != nil {
		t.Fatalf("ensurePackageJSON() error = %v", err)
	}

	// #nosec G304 -- pkgPath points to a test temp file created in this test.
	got, err := os.ReadFile(pkgPath)
	if err != nil {
		t.Fatal(err)
	}
	content := string(got)

	// Original fields must be preserved.
	if !strings.Contains(content, `"name": "custom"`) && !strings.Contains(content, `"name":"custom"`) {
		t.Errorf("package.json lost name field: %s", content)
	}
	if !strings.Contains(content, `"version": "9.9.9"`) && !strings.Contains(content, `"version":"9.9.9"`) {
		t.Errorf("package.json lost version field: %s", content)
	}

	// pnpm.overrides must be injected.
	if !strings.Contains(content, `"overrides"`) {
		t.Errorf("package.json missing pnpm.overrides: %s", content)
	}
	if !strings.Contains(content, `"@kb-labs/sdk"`) {
		t.Errorf("package.json missing @kb-labs/sdk override: %s", content)
	}
}

// TestEnsurePackageJSONCreatesDir verifies that ensurePackageJSON creates the
// target directory if it does not exist.
func TestEnsurePackageJSONCreatesDir(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "new", "nested", "dir")

	if err := ensurePackageJSON(dir); err != nil {
		t.Fatalf("ensurePackageJSON() error = %v", err)
	}

	if _, err := os.Stat(filepath.Join(dir, "package.json")); err != nil {
		t.Errorf("package.json not created in nested dir: %v", err)
	}
}

// TestEnsureNpmrcWritesDefaultWhenNoRegistry verifies that a platform-local
// .npmrc is always written, even when the user didn't configure a custom
// registry. This is required so the installer can point NPM_CONFIG_USERCONFIG
// at it and isolate pnpm from the user's global ~/.npmrc (which may contain
// unresolved ${NPM_TOKEN} references that produce noisy warnings).
func TestEnsureNpmrcWritesDefaultWhenNoRegistry(t *testing.T) {
	dir := t.TempDir()
	p := &PnpmManager{}

	if err := p.ensureNpmrc(dir); err != nil {
		t.Fatalf("ensureNpmrc() error = %v", err)
	}

	// #nosec G304 -- path under t.TempDir().
	data, err := os.ReadFile(filepath.Join(dir, ".npmrc"))
	if err != nil {
		t.Fatalf(".npmrc not written: %v", err)
	}

	const wantDefault = "registry=https://registry.npmjs.org/"
	if !strings.Contains(string(data), wantDefault) {
		t.Errorf(".npmrc missing default registry: got %q, want it to contain %q", string(data), wantDefault)
	}
}

// TestEnsureNpmrcHonorsCustomRegistry verifies that a custom registry from
// the manager config is written verbatim into the local .npmrc.
func TestEnsureNpmrcHonorsCustomRegistry(t *testing.T) {
	dir := t.TempDir()
	p := &PnpmManager{Registry: "http://localhost:4873/"}

	if err := p.ensureNpmrc(dir); err != nil {
		t.Fatalf("ensureNpmrc() error = %v", err)
	}

	// #nosec G304 -- path under t.TempDir().
	data, err := os.ReadFile(filepath.Join(dir, ".npmrc"))
	if err != nil {
		t.Fatalf(".npmrc not written: %v", err)
	}

	const want = "registry=http://localhost:4873/"
	if !strings.Contains(string(data), want) {
		t.Errorf(".npmrc missing custom registry: got %q, want it to contain %q", string(data), want)
	}
}
