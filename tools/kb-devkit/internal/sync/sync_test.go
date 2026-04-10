package sync

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/kb-labs/devkit/internal/config"
	"github.com/kb-labs/devkit/internal/workspace"
)

func TestSyncerRunCopiesChecksDryRunAndExcludes(t *testing.T) {
	root := t.TempDir()
	sourceDir := filepath.Join(root, "templates")
	writeSyncFile(t, filepath.Join(sourceDir, "base", "keep.txt"), "hello")
	writeSyncFile(t, filepath.Join(sourceDir, "base", "skip.log"), "ignore")

	repoRoot := filepath.Join(root, "repos", "pkg-a")
	writeSyncFile(t, filepath.Join(repoRoot, ".git", "keep"), "")
	pkgDir := filepath.Join(repoRoot, "packages", "pkg-a")
	writeSyncFile(t, filepath.Join(pkgDir, "package.json"), `{"name":"@kb/pkg-a"}`)

	ws := &workspace.Workspace{
		Root: root,
		Packages: []workspace.Package{
			{Name: "@kb/pkg-a", Dir: pkgDir},
		},
	}
	cfg := &config.DevkitConfig{
		Sync: config.SyncConfig{
			Sources: map[string]config.SyncSource{
				"templates": {Type: "local", Path: sourceDir},
			},
			Targets: []config.SyncTarget{
				{Source: "templates", From: "base", To: ".config"},
			},
			Exclude: []string{"**/*.log"},
		},
	}

	s := New(root, cfg, ws)

	dry, err := s.Run(Options{DryRun: true})
	if err != nil {
		t.Fatalf("Run dry-run error: %v", err)
	}
	if len(dry.Created) != 1 || len(dry.Skipped) != 1 {
		t.Fatalf("dry result = %+v", dry)
	}

	applied, err := s.Run(Options{})
	if err != nil {
		t.Fatalf("Run apply error: %v", err)
	}
	dest := filepath.Join(repoRoot, ".config", "keep.txt")
	if len(applied.Created) != 1 {
		t.Fatalf("apply result = %+v", applied)
	}
	data, err := os.ReadFile(dest)
	if err != nil {
		t.Fatalf("read dest: %v", err)
	}
	if string(data) != "hello" {
		t.Fatalf("dest content = %q", data)
	}

	writeSyncFile(t, filepath.Join(sourceDir, "base", "keep.txt"), "changed")
	check, err := s.Run(Options{Check: true})
	if err != nil {
		t.Fatalf("Run check error: %v", err)
	}
	if len(check.Drifted) != 1 || check.Drifted[0] != dest {
		t.Fatalf("check result = %+v", check)
	}
}

func TestSyncerRunNormalizesFromPathWithTrailingSlash(t *testing.T) {
	root := t.TempDir()
	sourceDir := filepath.Join(root, "templates")
	writeSyncFile(t, filepath.Join(sourceDir, "agents", "agent.md"), "hello")

	repoRoot := filepath.Join(root, "repos", "pkg-a")
	writeSyncFile(t, filepath.Join(repoRoot, ".git", "keep"), "")
	pkgDir := filepath.Join(repoRoot, "packages", "pkg-a")
	writeSyncFile(t, filepath.Join(pkgDir, "package.json"), `{"name":"@kb/pkg-a"}`)

	ws := &workspace.Workspace{
		Root: root,
		Packages: []workspace.Package{
			{Name: "@kb/pkg-a", Dir: pkgDir},
		},
	}
	cfg := &config.DevkitConfig{
		Sync: config.SyncConfig{
			Sources: map[string]config.SyncSource{
				"templates": {Type: "local", Path: sourceDir},
			},
			Targets: []config.SyncTarget{
				{Source: "templates", From: "agents/", To: ".kb/devkit/agents"},
			},
		},
	}

	s := New(root, cfg, ws)

	result, err := s.Run(Options{DryRun: true})
	if err != nil {
		t.Fatalf("Run dry-run error: %v", err)
	}
	if len(result.Created) != 1 {
		t.Fatalf("dry result = %+v", result)
	}
}

func TestSyncHelpersAndSourceValidation(t *testing.T) {
	root := t.TempDir()
	pkgGitRoot := filepath.Join(root, "repo")
	pkgDir := filepath.Join(pkgGitRoot, "packages", "pkg")
	writeSyncFile(t, filepath.Join(pkgGitRoot, ".git", "keep"), "")
	writeSyncFile(t, filepath.Join(pkgDir, "package.json"), `{"name":"@kb/pkg"}`)

	ws := &workspace.Workspace{
		Root: root,
		Packages: []workspace.Package{
			{Name: "@kb/pkg", Dir: pkgDir},
		},
	}

	roots := collectSubmoduleRoots(ws)
	if len(roots) != 1 || roots[0] != pkgGitRoot {
		t.Fatalf("collectSubmoduleRoots = %#v", roots)
	}
	if got := findGitRoot(pkgDir); got != pkgGitRoot {
		t.Fatalf("findGitRoot = %q, want %q", got, pkgGitRoot)
	}
	if sha256sum([]byte("a")) == sha256sum([]byte("b")) {
		t.Fatal("sha256sum collision in test input")
	}
	if got := normalizeSyncPath("agents/"); got != "agents" {
		t.Fatalf("normalizeSyncPath(agents/) = %q", got)
	}
	if got := normalizeSyncPath("./skills"); got != "skills" {
		t.Fatalf("normalizeSyncPath(./skills) = %q", got)
	}

	local := &LocalSource{root: root}
	if _, err := local.Resolve(config.SyncSource{}); err == nil {
		t.Fatal("LocalSource.Resolve missing path error = nil")
	}

	npm := &NpmSource{root: root}
	if _, err := npm.Resolve(config.SyncSource{}); err == nil {
		t.Fatal("NpmSource.Resolve missing package error = nil")
	}

	src := filepath.Join(root, "src.txt")
	dst := filepath.Join(root, "nested", "dst.txt")
	writeSyncFile(t, src, "copied")
	if err := copyFile(src, dst); err != nil {
		t.Fatalf("copyFile error: %v", err)
	}
	data, err := os.ReadFile(dst)
	if err != nil {
		t.Fatalf("read copied file: %v", err)
	}
	if string(data) != "copied" {
		t.Fatalf("copied data = %q", data)
	}
}

func writeSyncFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", path, err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
