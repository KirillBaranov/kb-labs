// Package demo orchestrates the post-install "first commit" experience.
// After installation completes, if the project has uncommitted changes,
// the user is offered a single-keystroke AI commit via kb commit.
package demo

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// RunFirstCommit checks for uncommitted changes in projectDir and, if found,
// offers to generate an AI commit message via `kb commit commit`.
// It is intentionally simple: no flags, no config, one prompt.
func RunFirstCommit(projectDir string) error {
	if !isGitRepo(projectDir) {
		return nil
	}

	count, err := uncommittedCount(projectDir)
	if err != nil || count == 0 {
		return nil
	}

	fmt.Println()

	noun := "change"
	if count != 1 {
		noun = "changes"
	}
	fmt.Printf("  ✦  Found %d unsaved %s in your project.\n", count, noun)
	fmt.Println()
	fmt.Println("  Want me to write the commit message?")
	fmt.Println("  Your diff will be sent to an LLM. No code is stored.")
	fmt.Println()
	fmt.Print("  Try it?  y / n  → ")

	answer, _ := readLine()
	answer = strings.TrimSpace(strings.ToLower(answer))
	if answer != "y" {
		return nil
	}

	kbPath, err := exec.LookPath("kb")
	if err != nil {
		fmt.Fprintf(os.Stderr, "  kb CLI not found — skipping commit\n")
		return nil
	}

	fmt.Println()

	ctx := context.Background()
	cmd := exec.CommandContext(ctx, kbPath, "commit", "commit", "--scope=.") // #nosec G204 -- kbPath from LookPath
	cmd.Dir = projectDir
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "  commit: %v\n", err)
	}

	return nil
}

// isGitRepo returns true if projectDir is inside a git repository.
func isGitRepo(dir string) bool {
	cmd := exec.CommandContext(context.Background(), "git", "rev-parse", "--git-dir")
	cmd.Dir = dir
	return cmd.Run() == nil
}

// uncommittedCount returns the number of uncommitted files (staged + unstaged).
func uncommittedCount(dir string) (int, error) {
	cmd := exec.CommandContext(context.Background(), "git", "status", "--porcelain")
	cmd.Dir = dir
	out, err := cmd.Output()
	if err != nil {
		return 0, err
	}
	trimmed := strings.TrimSpace(string(out))
	if trimmed == "" {
		return 0, nil
	}
	return len(strings.Split(trimmed, "\n")), nil
}

// readLine reads a single line from stdin.
func readLine() (string, error) {
	scanner := bufio.NewScanner(os.Stdin)
	if scanner.Scan() {
		return scanner.Text(), nil
	}
	return "", scanner.Err()
}
