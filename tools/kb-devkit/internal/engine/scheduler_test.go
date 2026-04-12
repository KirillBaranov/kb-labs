package engine

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/kb-labs/devkit/internal/config"
	"github.com/kb-labs/devkit/internal/workspace"
)

// writePkgJSON creates a minimal package.json in dir.
func writePkgJSON(t *testing.T, dir, content string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestBuildPkgDepMapFiltersSelfReference(t *testing.T) {
	root := t.TempDir()

	devkitDir := filepath.Join(root, "devkit")
	writePkgJSON(t, devkitDir, `{
		"name": "@kb/devkit",
		"devDependencies": {"@kb/devkit": "workspace:*"}
	}`)

	pkgs := []workspace.Package{
		{Name: "@kb/devkit", Dir: devkitDir},
	}
	pkgByName := map[string]workspace.Package{
		"@kb/devkit": pkgs[0],
	}

	depMap := buildPkgDepMap(pkgs, pkgByName)

	if deps, ok := depMap["@kb/devkit"]; ok && len(deps) > 0 {
		t.Fatalf("self-reference not filtered: got deps %v for @kb/devkit", deps)
	}
}

func TestBuildPkgDepMapKeepsLegitDeps(t *testing.T) {
	root := t.TempDir()

	typesDir := filepath.Join(root, "types")
	writePkgJSON(t, typesDir, `{"name": "@kb/types"}`)

	appDir := filepath.Join(root, "app")
	writePkgJSON(t, appDir, `{
		"name": "@kb/app",
		"dependencies": {"@kb/types": "workspace:*"},
		"devDependencies": {"@kb/app": "workspace:*"}
	}`)

	pkgs := []workspace.Package{
		{Name: "@kb/types", Dir: typesDir},
		{Name: "@kb/app", Dir: appDir},
	}
	pkgByName := map[string]workspace.Package{
		"@kb/types": pkgs[0],
		"@kb/app":   pkgs[1],
	}

	depMap := buildPkgDepMap(pkgs, pkgByName)

	// @kb/app should depend on @kb/types but NOT on itself
	deps := depMap["@kb/app"]
	if len(deps) != 1 || deps[0] != "@kb/types" {
		t.Fatalf("@kb/app deps = %v, want [@kb/types]", deps)
	}
}

func TestBuildDAGSelfDepDoesNotCreateCycle(t *testing.T) {
	root := t.TempDir()

	// Simulate @kb-labs/devkit depending on itself — the exact real-world bug.
	devkitDir := filepath.Join(root, "devkit")
	writePkgJSON(t, devkitDir, `{
		"name": "@kb/devkit",
		"devDependencies": {"@kb/devkit": "workspace:*"}
	}`)

	coreDir := filepath.Join(root, "core")
	writePkgJSON(t, coreDir, `{
		"name": "@kb/core",
		"devDependencies": {"@kb/devkit": "workspace:*"}
	}`)

	pkgs := []workspace.Package{
		{Name: "@kb/devkit", Dir: devkitDir, Category: "ts-lib"},
		{Name: "@kb/core", Dir: coreDir, Category: "ts-lib"},
	}

	cfg := &config.DevkitConfig{
		Tasks: map[string]config.TaskConfig{
			"build": {
				{Categories: []string{"ts-lib"}, Command: "tsup", Deps: []string{"^build"}},
			},
		},
	}
	ws := &workspace.Workspace{Root: root, Packages: pkgs}

	nodes, err := buildDAG(pkgs, []string{"build"}, cfg, ws)
	if err != nil {
		t.Fatal(err)
	}

	// Both packages must be in the DAG
	if len(nodes) != 2 {
		t.Fatalf("expected 2 nodes, got %d", len(nodes))
	}

	// @kb/devkit must have zero deps (self-ref filtered)
	devkitNode := nodes[nodeKey{"@kb/devkit", "build"}]
	if len(devkitNode.deps) != 0 {
		t.Fatalf("@kb/devkit should have 0 deps, got %v", devkitNode.deps)
	}

	// @kb/core depends on @kb/devkit only
	coreNode := nodes[nodeKey{"@kb/core", "build"}]
	if len(coreNode.deps) != 1 || coreNode.deps[0].pkg != "@kb/devkit" {
		t.Fatalf("@kb/core deps = %v, want [{@kb/devkit build}]", coreNode.deps)
	}

	// Verify no cycles: compute in-degrees, confirm both packages become runnable
	inDegree := map[nodeKey]int{}
	for k := range nodes {
		inDegree[k] = 0
	}
	for k, n := range nodes {
		_ = k
		for _, dep := range n.deps {
			inDegree[nodeKey{dep.pkg, dep.task}]++
		}
	}

	// At least one node must have in-degree 0 (DAG root)
	hasRoot := false
	for _, deg := range inDegree {
		if deg == 0 {
			hasRoot = true
			break
		}
	}
	if !hasRoot {
		t.Fatal("no DAG root found — cycle detected (in-degree > 0 for all nodes)")
	}
}
