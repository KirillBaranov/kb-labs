package engine

import (
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestGitChangedFilesDetectsTrackedModifications(t *testing.T) {
	repo := t.TempDir()
	writeEngineFile(t, filepath.Join(repo, "tracked.txt"), "v1\n")
	initGitRepo(t, repo)
	gitCommitAll(t, repo, "init")

	writeEngineFile(t, filepath.Join(repo, "tracked.txt"), "v2\n")

	files, err := gitChangedFiles(repo, repo)
	if err != nil {
		t.Fatalf("gitChangedFiles error: %v", err)
	}
	if len(files) != 1 || files[0] != filepath.Join(repo, "tracked.txt") {
		t.Fatalf("gitChangedFiles = %#v", files)
	}
}

func TestSubmoduleChangedFilesReadsGitmodulesAndFallsBack(t *testing.T) {
	root := t.TempDir()

	child := filepath.Join(root, "plugins", "plugin-a")
	writeEngineFile(t, filepath.Join(child, "file.txt"), "v1\n")
	initGitRepo(t, child)
	gitCommitAll(t, child, "init")
	writeEngineFile(t, filepath.Join(child, "file.txt"), "v2\n")

	gitmodules := `[submodule "plugin-a"]
	path = plugins/plugin-a
	url = https://example.invalid/plugin-a.git
`
	writeEngineFile(t, filepath.Join(root, ".gitmodules"), gitmodules)

	files, err := submoduleChangedFiles(root)
	if err != nil {
		t.Fatalf("submoduleChangedFiles error: %v", err)
	}
	if len(files) != 1 || files[0] != filepath.Join(child, "file.txt") {
		t.Fatalf("submoduleChangedFiles = %#v", files)
	}

	fallback := t.TempDir()
	writeEngineFile(t, filepath.Join(fallback, "root.txt"), "a\n")
	initGitRepo(t, fallback)
	gitCommitAll(t, fallback, "init")
	writeEngineFile(t, filepath.Join(fallback, "root.txt"), "b\n")

	files, err = submoduleChangedFiles(fallback)
	if err != nil {
		t.Fatalf("submoduleChangedFiles fallback error: %v", err)
	}
	if len(files) != 1 || files[0] != filepath.Join(fallback, "root.txt") {
		t.Fatalf("submoduleChangedFiles fallback = %#v", files)
	}
}

func initGitRepo(t *testing.T, dir string) {
	t.Helper()
	runGit(t, dir, "init")
	runGit(t, dir, "config", "user.email", "devkit@example.com")
	runGit(t, dir, "config", "user.name", "Devkit Tests")
}

func gitCommitAll(t *testing.T, dir, msg string) {
	t.Helper()
	runGit(t, dir, "add", ".")
	runGit(t, dir, "commit", "-m", msg)
}

func runGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s failed: %v\n%s", strings.Join(args, " "), err, out)
	}
}
