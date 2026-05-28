package engine

import (
	"path/filepath"
	"testing"

	"github.com/kb-labs/devkit/internal/cache"
	"github.com/kb-labs/devkit/internal/workspace"
)

// makeWS builds a minimal Workspace from a slice of package names.
// Packages are in the order provided — workspace order is preserved.
func makeWS(names ...string) *workspace.Workspace {
	pkgs := make([]workspace.Package, len(names))
	for i, n := range names {
		pkgs[i] = workspace.Package{Name: n, Dir: "/fake/" + n}
	}
	return &workspace.Workspace{Root: "/fake", Packages: pkgs}
}

func TestDirtyPackagesIncludesNeverBuilt(t *testing.T) {
	cacheRoot := filepath.Join(t.TempDir(), ".kb", "devkit")
	ws := makeWS("@kb/app")

	got := DirtyPackages(ws, []string{"build"}, cacheRoot)
	if len(got) != 1 || got[0].Name != "@kb/app" {
		t.Fatalf("DirtyPackages = %v, want [@kb/app] (no state file = dirty)", got)
	}
}

func TestDirtyPackagesExcludesCleanState(t *testing.T) {
	cacheRoot := filepath.Join(t.TempDir(), ".kb", "devkit")
	states := cache.NewStateStore(cacheRoot)
	if err := states.SetClean("@kb/app", "build", "h1"); err != nil {
		t.Fatalf("SetClean: %v", err)
	}
	ws := makeWS("@kb/app")

	got := DirtyPackages(ws, []string{"build"}, cacheRoot)
	if len(got) != 0 {
		t.Fatalf("DirtyPackages = %v, want [] (state is CLEAN)", got)
	}
}

func TestDirtyPackagesIncludesDirtyState(t *testing.T) {
	cacheRoot := filepath.Join(t.TempDir(), ".kb", "devkit")
	states := cache.NewStateStore(cacheRoot)
	if err := states.SetDirty("@kb/app", "build", "last_run_failed"); err != nil {
		t.Fatalf("SetDirty: %v", err)
	}
	ws := makeWS("@kb/app")

	got := DirtyPackages(ws, []string{"build"}, cacheRoot)
	if len(got) != 1 || got[0].Name != "@kb/app" {
		t.Fatalf("DirtyPackages = %v, want [@kb/app] (state is DIRTY)", got)
	}
}

func TestDirtyPackagesAllTasksMustBeClean(t *testing.T) {
	cacheRoot := filepath.Join(t.TempDir(), ".kb", "devkit")
	states := cache.NewStateStore(cacheRoot)
	// build is clean but test is dirty
	if err := states.SetClean("@kb/app", "build", "h1"); err != nil {
		t.Fatalf("SetClean build: %v", err)
	}
	if err := states.SetDirty("@kb/app", "test", "last_run_failed"); err != nil {
		t.Fatalf("SetDirty test: %v", err)
	}
	ws := makeWS("@kb/app")

	got := DirtyPackages(ws, []string{"build", "test"}, cacheRoot)
	if len(got) != 1 || got[0].Name != "@kb/app" {
		t.Fatalf("DirtyPackages = %v, want [@kb/app] (test task is DIRTY)", got)
	}

	// Now fix test state — both clean → excluded
	if err := states.SetClean("@kb/app", "test", "h2"); err != nil {
		t.Fatalf("SetClean test: %v", err)
	}
	got2 := DirtyPackages(ws, []string{"build", "test"}, cacheRoot)
	if len(got2) != 0 {
		t.Fatalf("DirtyPackages = %v, want [] (all tasks CLEAN)", got2)
	}
}

func TestDirtyPackagesEmptyTasks(t *testing.T) {
	cacheRoot := filepath.Join(t.TempDir(), ".kb", "devkit")
	ws := makeWS("@kb/app")

	got := DirtyPackages(ws, []string{}, cacheRoot)
	if len(got) != 0 {
		t.Fatalf("DirtyPackages with empty tasks = %v, want []", got)
	}
}

func TestUnionPackagesPreservesWorkspaceOrder(t *testing.T) {
	ws := makeWS("A", "B", "C", "D")
	a := []workspace.Package{{Name: "B"}}
	b := []workspace.Package{{Name: "A"}, {Name: "C"}}

	got := UnionPackages(ws, a, b)
	if len(got) != 3 {
		t.Fatalf("UnionPackages len = %d, want 3", len(got))
	}
	if got[0].Name != "A" || got[1].Name != "B" || got[2].Name != "C" {
		t.Fatalf("UnionPackages order = [%s,%s,%s], want [A,B,C]",
			got[0].Name, got[1].Name, got[2].Name)
	}
}

func TestUnionPackagesDeduplicates(t *testing.T) {
	ws := makeWS("A", "B", "C")
	a := []workspace.Package{{Name: "A"}, {Name: "B"}}
	b := []workspace.Package{{Name: "B"}, {Name: "C"}}

	got := UnionPackages(ws, a, b)
	if len(got) != 3 {
		t.Fatalf("UnionPackages len = %d, want 3 (no duplicates)", len(got))
	}
}

func TestUnionPackagesEmptyAffected(t *testing.T) {
	ws := makeWS("A", "B")
	got := UnionPackages(ws, nil, []workspace.Package{{Name: "B"}})
	if len(got) != 1 || got[0].Name != "B" {
		t.Fatalf("UnionPackages = %v, want [B]", got)
	}
}

func TestUnionPackagesEmptyDirty(t *testing.T) {
	ws := makeWS("A", "B")
	got := UnionPackages(ws, []workspace.Package{{Name: "A"}}, nil)
	if len(got) != 1 || got[0].Name != "A" {
		t.Fatalf("UnionPackages = %v, want [A]", got)
	}
}
