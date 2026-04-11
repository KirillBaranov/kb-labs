package demo

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestIsGitRepo_True(t *testing.T) {
	dir := t.TempDir()
	// Initialize a git repo
	cmd := exec.Command("git", "init")
	cmd.Dir = dir
	if err := cmd.Run(); err != nil {
		t.Skipf("git not available: %v", err)
	}

	if !isGitRepo(dir) {
		t.Error("isGitRepo() = false, want true for initialized git repo")
	}
}

func TestIsGitRepo_False(t *testing.T) {
	dir := t.TempDir()
	// No git init — just an empty directory

	if isGitRepo(dir) {
		t.Error("isGitRepo() = true, want false for non-git directory")
	}
}

func TestUncommittedCount_Clean(t *testing.T) {
	dir := initGitRepo(t)

	count, err := uncommittedCount(dir)
	if err != nil {
		t.Fatalf("uncommittedCount() error = %v", err)
	}
	if count != 0 {
		t.Errorf("uncommittedCount() = %d, want 0 for clean repo", count)
	}
}

func TestUncommittedCount_WithChanges(t *testing.T) {
	dir := initGitRepo(t)

	// Create a new untracked file
	if err := os.WriteFile(filepath.Join(dir, "new-file.txt"), []byte("hello"), 0o600); err != nil {
		t.Fatal(err)
	}

	count, err := uncommittedCount(dir)
	if err != nil {
		t.Fatalf("uncommittedCount() error = %v", err)
	}
	if count != 1 {
		t.Errorf("uncommittedCount() = %d, want 1", count)
	}
}

func TestUncommittedCount_MultipleChanges(t *testing.T) {
	dir := initGitRepo(t)

	// Create multiple files
	for _, name := range []string{"a.txt", "b.txt", "c.txt"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	count, err := uncommittedCount(dir)
	if err != nil {
		t.Fatalf("uncommittedCount() error = %v", err)
	}
	if count != 3 {
		t.Errorf("uncommittedCount() = %d, want 3", count)
	}
}

func TestUncommittedCount_StagedFile(t *testing.T) {
	dir := initGitRepo(t)

	// Create and stage a file
	file := filepath.Join(dir, "staged.txt")
	if err := os.WriteFile(file, []byte("staged"), 0o600); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "staged.txt")
	cmd.Dir = dir
	if err := cmd.Run(); err != nil {
		t.Fatal(err)
	}

	count, err := uncommittedCount(dir)
	if err != nil {
		t.Fatalf("uncommittedCount() error = %v", err)
	}
	if count != 1 {
		t.Errorf("uncommittedCount() = %d, want 1 for staged file", count)
	}
}

// initGitRepo creates a temp dir with an initialized git repo and initial commit.
func initGitRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()

	commands := [][]string{
		{"git", "init"},
		{"git", "config", "user.email", "test@test.com"},
		{"git", "config", "user.name", "Test"},
		{"git", "commit", "--allow-empty", "-m", "initial"},
	}
	for _, args := range commands {
		cmd := exec.Command(args[0], args[1:]...)
		cmd.Dir = dir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Skipf("%v failed: %v\n%s", args, err, out)
		}
	}

	return dir
}
