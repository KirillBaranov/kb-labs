package engine

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/kb-labs/devkit/internal/cache"
)

func TestExpandOutputFilesAndSplitCommand(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "dist", "a.js"), "a")
	writeFile(t, filepath.Join(root, "dist", "nested", "b.js"), "b")

	files, err := expandOutputFiles(root, []string{"dist/**/*.js", "dist/*.js"})
	if err != nil {
		t.Fatalf("expandOutputFiles error: %v", err)
	}
	if len(files) != 2 {
		t.Fatalf("files = %#v, want 2", files)
	}

	parts := splitCommand(`node -e "console.log('hi there')"`)
	if len(parts) != 3 || parts[2] != "console.log('hi there')" {
		t.Fatalf("splitCommand = %#v", parts)
	}

	if !matchGlobSimple("dist/**/*.js", "dist/nested/b.js") {
		t.Fatal("matchGlobSimple recursive match = false, want true")
	}
}

func TestExecutorStoresAndRestoresOutputsThroughCache(t *testing.T) {
	root := t.TempDir()
	cacheRoot := filepath.Join(root, ".kb", "devkit")
	store, err := cache.NewLocalStore(cacheRoot)
	if err != nil {
		t.Fatalf("NewLocalStore error: %v", err)
	}
	manifests := cache.NewManifestStore(cacheRoot)
	exec := NewExecutor(store, manifests, root, false)

	pkgDir := filepath.Join(root, "pkg")
	writeFile(t, filepath.Join(pkgDir, "input.txt"), "hello")
	writeFile(t, filepath.Join(pkgDir, "out.txt"), "artifact")

	refs, err := exec.storeOutputs(pkgDir, []string{"out.txt"})
	if err != nil {
		t.Fatalf("storeOutputs error: %v", err)
	}
	if len(refs) != 1 {
		t.Fatalf("refs = %#v, want 1", refs)
	}

	if err := os.Remove(filepath.Join(pkgDir, "out.txt")); err != nil {
		t.Fatalf("remove out.txt: %v", err)
	}
	m := &cache.Manifest{Outputs: refs}
	if err := exec.restoreOutputs(m, pkgDir); err != nil {
		t.Fatalf("restoreOutputs error: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(pkgDir, "out.txt"))
	if err != nil {
		t.Fatalf("read restored output: %v", err)
	}
	if string(data) != "artifact" {
		t.Fatalf("restored output = %q, want artifact", data)
	}
}

func TestResolveBinPrefersWorkspaceNodeModulesBin(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "node_modules", ".bin", "eslint"), "#!/bin/sh\n")
	got := resolveBin("eslint", root)
	if got != filepath.Join(root, "node_modules", ".bin", "eslint") {
		t.Fatalf("resolveBin = %q", got)
	}
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", path, err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
