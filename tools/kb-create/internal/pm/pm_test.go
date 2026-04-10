package pm

import (
	"os"
	"path/filepath"
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

// TestEnsurePackageJSONIdempotent verifies that calling ensurePackageJSON twice
// does not overwrite an existing package.json.
func TestEnsurePackageJSONIdempotent(t *testing.T) {
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
	if string(got) != custom {
		t.Errorf("package.json overwritten: got %q, want %q", string(got), custom)
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
