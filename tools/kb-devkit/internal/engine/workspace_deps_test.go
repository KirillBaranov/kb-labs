package engine

import (
	"os"
	"path/filepath"
	"sort"
	"testing"

	"github.com/kb-labs/devkit/internal/workspace"
)

func TestWorkspaceDepsReadsAllThreeSections(t *testing.T) {
	root := t.TempDir()

	// @kb/types is a workspace package listed in peerDependencies — it IS in pkgByName,
	// so it must be included (devkit doesn't filter by "workspace:*" syntax, only by membership).
	pkgByName := map[string]workspace.Package{
		"@kb/core":    {Name: "@kb/core", Dir: filepath.Join(root, "core")},
		"@kb/devkit":  {Name: "@kb/devkit", Dir: filepath.Join(root, "devkit")},
		"@kb/types":   {Name: "@kb/types", Dir: filepath.Join(root, "types")},
		"@kb/testing": {Name: "@kb/testing", Dir: filepath.Join(root, "testing")},
	}

	pkgJSON := `{
		"name": "@kb/app",
		"dependencies":    {"@kb/core":    "workspace:*"},
		"devDependencies": {"@kb/devkit":  "workspace:*", "@kb/testing": "workspace:*"},
		"peerDependencies":{"@kb/types":   "workspace:*"}
	}`

	dir := filepath.Join(root, "app")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(pkgJSON), 0o644); err != nil {
		t.Fatal(err)
	}

	got := WorkspaceDeps(dir, pkgByName)
	sort.Strings(got)

	want := []string{"@kb/core", "@kb/devkit", "@kb/testing", "@kb/types"}
	if len(got) != len(want) {
		t.Fatalf("WorkspaceDeps = %v, want %v", got, want)
	}
	for i, w := range want {
		if got[i] != w {
			t.Fatalf("WorkspaceDeps[%d] = %q, want %q", i, got[i], w)
		}
	}
}

func TestWorkspaceDepsDeduplicatesAcrossSections(t *testing.T) {
	root := t.TempDir()

	pkgByName := map[string]workspace.Package{
		"@kb/shared": {Name: "@kb/shared", Dir: filepath.Join(root, "shared")},
	}

	// @kb/shared appears in both dependencies and devDependencies — must appear once.
	pkgJSON := `{
		"name": "@kb/app",
		"dependencies":    {"@kb/shared": "workspace:*"},
		"devDependencies": {"@kb/shared": "workspace:*"}
	}`

	dir := filepath.Join(root, "app")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(pkgJSON), 0o644); err != nil {
		t.Fatal(err)
	}

	got := WorkspaceDeps(dir, pkgByName)
	if len(got) != 1 || got[0] != "@kb/shared" {
		t.Fatalf("WorkspaceDeps dedup = %v, want [@kb/shared]", got)
	}
}

func TestWorkspaceDepsFiltersExternalPackages(t *testing.T) {
	root := t.TempDir()

	pkgByName := map[string]workspace.Package{
		"@kb/internal": {Name: "@kb/internal", Dir: filepath.Join(root, "internal")},
	}

	// react and typescript are external — must not appear in result.
	pkgJSON := `{
		"name": "@kb/app",
		"dependencies":    {"@kb/internal": "workspace:*", "react": "^18.0.0"},
		"devDependencies": {"typescript": "^5.0.0"}
	}`

	dir := filepath.Join(root, "app")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(pkgJSON), 0o644); err != nil {
		t.Fatal(err)
	}

	got := WorkspaceDeps(dir, pkgByName)
	if len(got) != 1 || got[0] != "@kb/internal" {
		t.Fatalf("WorkspaceDeps external filter = %v, want [@kb/internal]", got)
	}
}

func TestWorkspaceDepsEmptyOnMissingPackageJSON(t *testing.T) {
	root := t.TempDir()
	pkgByName := map[string]workspace.Package{}

	got := WorkspaceDeps(filepath.Join(root, "nonexistent"), pkgByName)
	if len(got) != 0 {
		t.Fatalf("WorkspaceDeps missing dir = %v, want empty", got)
	}
}
