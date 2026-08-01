package deployment

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReadVersionsUsesMatrixComponents(t *testing.T) {
	root := t.TempDir()
	writePackage(t, root, "example-runtime", "2.105.0")
	writePackage(t, root, "example-sdk", "2.100.0")
	matrix := Matrix{Components: map[string]Component{
		"runtime": {Package: "example-runtime"},
		"sdk":     {Package: "example-sdk"},
	}}

	got, err := ReadVersions(root, matrix)
	if err != nil {
		t.Fatal(err)
	}
	if got["runtime"] != "2.105.0" || got["sdk"] != "2.100.0" {
		t.Errorf("ReadVersions() = %#v", got)
	}
}

func TestCheckTargetUsesMatrixRangeInsteadOfExactPins(t *testing.T) {
	matrix := Matrix{Rules: []Rule{{
		Component: "runtime", VersionRange: ">=2.105.0 <2.106.0",
		Requires: map[string]string{"sdk": ">=2.95.0 <=2.120.0"},
	}}}
	contract := Contract{
		Schema: ContractSchema, Service: "gateway",
		Requirements: map[string]string{"runtime": ">=2.105.0 <2.106.0", "sdk": ">=2.95.0 <=2.120.0"},
	}

	if err := CheckTarget(contract, map[string]string{"runtime": "2.105.0", "sdk": "2.100.0"}, matrix); err != nil {
		t.Fatalf("CheckTarget() = %v, want compatible", err)
	}
	if err := CheckTarget(contract, map[string]string{"runtime": "2.105.0", "sdk": "2.121.0"}, matrix); err == nil || !strings.Contains(err.Error(), "does not satisfy") {
		t.Fatalf("CheckTarget() error = %v, want range mismatch", err)
	}
}

func TestCheckTargetRejectsCompositionForOldServiceRelease(t *testing.T) {
	matrix := Matrix{Rules: []Rule{{
		Component: "runtime", VersionRange: ">=2.105.0 <2.106.0",
		Requires: map[string]string{"sdk": ">=2.95.0 <=2.120.0"},
	}}}
	contract := Contract{Schema: ContractSchema, Service: "gateway", Requirements: map[string]string{"runtime": ">=2.105.0 <2.106.0"}}
	err := CheckTarget(contract, map[string]string{"runtime": "2.095.0", "sdk": "2.100.0"}, matrix)
	if err == nil || !strings.Contains(err.Error(), "no compatibility rule supports runtime 2.095.0") {
		t.Fatalf("CheckTarget() error = %v, want old-runtime mismatch", err)
	}
}

func writePackage(t *testing.T, root, name, version string) {
	t.Helper()
	path := filepath.Join(root, "node_modules", filepath.FromSlash(name), "package.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(`{"version":"`+version+`"}`), 0o600); err != nil {
		t.Fatal(err)
	}
}
