package workspace

import (
	"os"
	"path/filepath"
	"sort"
	"testing"

	"github.com/kb-labs/devkit/internal/config"
)

func TestDiscoverPackagesFallsBackToPackageJSONWorkspaces(t *testing.T) {
	root := t.TempDir()
	mustWritePackage(t, filepath.Join(root, "package.json"), `{"workspaces":["packages/*"]}`)
	mustWritePackage(t, filepath.Join(root, "packages", "alpha", "package.json"), `{"name":"@kb/alpha"}`)
	mustWritePackage(t, filepath.Join(root, "packages", "beta", "package.json"), `{"name":"@kb/beta"}`)

	cfg := &config.DevkitConfig{
		Workspace: config.WorkspaceConfig{
			Categories: []config.NamedCategory{
				{Name: "libs", Category: config.CategoryConfig{Match: []string{"packages/*"}, Preset: "node-lib"}},
			},
		},
	}

	pkgs, err := discoverPackages(root, cfg)
	if err != nil {
		t.Fatalf("discoverPackages error: %v", err)
	}
	if len(pkgs) != 2 {
		t.Fatalf("packages count = %d, want 2", len(pkgs))
	}

	names := []string{pkgs[0].Name, pkgs[1].Name}
	sort.Strings(names)
	if names[0] != "@kb/alpha" || names[1] != "@kb/beta" {
		t.Fatalf("package names = %#v", names)
	}
}

func TestExpandPatternCollectsRecursivePackagesAndSkipsIgnoredDirs(t *testing.T) {
	root := t.TempDir()
	mustWritePackage(t, filepath.Join(root, "packages", "alpha", "package.json"), `{"name":"alpha"}`)
	mustWritePackage(t, filepath.Join(root, "packages", "nested", "beta", "package.json"), `{"name":"beta"}`)
	mustWritePackage(t, filepath.Join(root, "packages", "node_modules", "ignored", "package.json"), `{"name":"ignored"}`)
	mustWritePackage(t, filepath.Join(root, "packages", ".hidden", "secret", "package.json"), `{"name":"secret"}`)

	got := expandPattern(root, "packages/**", 3)
	sort.Strings(got)

	want := []string{
		filepath.Join(root, "packages", "alpha"),
		filepath.Join(root, "packages", "nested", "beta"),
	}
	if len(got) != len(want) {
		t.Fatalf("expandPattern count = %d, want %d (%#v)", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("expandPattern[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestClassifyAndPackageByPath(t *testing.T) {
	root := t.TempDir()
	pkgDir := filepath.Join(root, "infra", "kb-labs-devkit-bin")
	mustWritePackage(t, filepath.Join(pkgDir, "package.json"), `{"name":"@kb-labs/devkit-bin"}`)
	mustWritePackage(t, filepath.Join(root, "package.json"), `{"workspaces":["infra/*"]}`)

	cfg := &config.DevkitConfig{
		Workspace: config.WorkspaceConfig{
			Categories: []config.NamedCategory{
				{Name: "tools", Category: config.CategoryConfig{Match: []string{"infra/*"}, Preset: "go-binary"}},
			},
		},
	}

	ws, err := New(root, cfg)
	if err != nil {
		t.Fatalf("workspace.New error: %v", err)
	}
	if len(ws.Packages) != 1 {
		t.Fatalf("packages count = %d, want 1", len(ws.Packages))
	}

	pkg := ws.Packages[0]
	if pkg.Category != "tools" || pkg.Preset != "go-binary" || pkg.Language != "go" {
		t.Fatalf("unexpected package classification: %+v", pkg)
	}

	ownedPath := filepath.Join(pkgDir, "cmd", "main.go")
	if err := os.MkdirAll(filepath.Dir(ownedPath), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(ownedPath, []byte("package main"), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	owner, ok := ws.PackageByPath(ownedPath)
	if !ok || owner.Name != "@kb-labs/devkit-bin" {
		t.Fatalf("PackageByPath = (%+v, %v), want @kb-labs/devkit-bin", owner, ok)
	}

	if got := ws.FilterByName([]string{"@kb-labs/devkit-bin"}); len(got) != 1 {
		t.Fatalf("FilterByName count = %d, want 1", len(got))
	}
	if got := ws.FilterByCategory("tools"); len(got) != 1 {
		t.Fatalf("FilterByCategory count = %d, want 1", len(got))
	}
}

func TestMatchPatternHandlesLiteralStarAndRecursiveSuffix(t *testing.T) {
	tests := []struct {
		pattern string
		path    string
		want    bool
	}{
		{pattern: "infra/*", path: "infra/kb-labs-devkit-bin", want: true},
		{pattern: "infra/*", path: "infra/tools/bin", want: false},
		{pattern: "platform/*/packages/**", path: "platform/kb-labs-cli/packages/cli-bin/src", want: true},
		{pattern: "platform/*/packages/**", path: "platform/kb-labs-cli", want: false},
	}

	for _, tt := range tests {
		if got := matchPattern(tt.pattern, tt.path); got != tt.want {
			t.Fatalf("matchPattern(%q, %q) = %v, want %v", tt.pattern, tt.path, got, tt.want)
		}
	}
}

func TestReadPackageNameFallsBackToDirectoryName(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "no-name")
	mustWritePackage(t, filepath.Join(dir, "package.json"), `{}`)
	if got := readPackageName(dir); got != "no-name" {
		t.Fatalf("readPackageName fallback = %q, want no-name", got)
	}
}

func mustWritePackage(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", path, err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
