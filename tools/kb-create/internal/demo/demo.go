// Package demo orchestrates the post-install first-run experience.
// After installation completes, it runs a quick review on any available
// diff and offers an AI commit — giving the user a "wow moment" on their
// own code without any extra configuration.
package demo

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// RunFirstDemo is the post-install entry point.
// It looks for something to show the user — staged changes, unstaged changes,
// or the last commit diff — runs a review, then offers a commit.
// When llmEnabled is true, uses LLM mode (works on any stack).
// When false, uses heuristic mode (ESLint/Ruff only — may show nothing).
// Everything is optional and non-fatal: failures are silently skipped.
func RunFirstDemo(projectDir string, llmEnabled bool) error {
	if !isGitRepo(projectDir) {
		return nil
	}

	kbPath, err := exec.LookPath("kb")
	if err != nil {
		return nil // kb CLI not on PATH yet — skip silently
	}

	fmt.Println()
	fmt.Println("  ─────────────────────────────────────────────")

	hasChanges := false
	count, _ := uncommittedCount(projectDir)
	if count > 0 {
		hasChanges = true
		noun := "change"
		if count != 1 {
			noun = "changes"
		}
		fmt.Printf("  ✦  Found %d %s in your project — running a quick review...\n", count, noun)
	} else {
		// No uncommitted changes — check if there are any commits at all
		if hasCommits(projectDir) {
			fmt.Println("  ✦  Running a quick review on your last commit...")
		} else {
			// Brand new empty repo — nothing to show
			fmt.Println()
			fmt.Println("  Try it now:")
			fmt.Println()
			fmt.Println("    kb review run --scope=all   — review your code")
			fmt.Println("    kb commit commit            — generate a commit message")
			fmt.Println()
			return nil
		}
	}

	fmt.Println()

	// Run review — LLM mode works on any stack, heuristic requires ESLint/Ruff
	scope := "staged"
	if count == 0 {
		scope = "changed"
	}
	mode := "heuristic"
	if llmEnabled {
		mode = "llm"
	}

	ctx := context.Background()
	reviewCmd := exec.CommandContext(ctx, kbPath, "review", "run", "--mode="+mode, "--scope="+scope) // #nosec G204
	reviewCmd.Dir = projectDir
	reviewCmd.Stdout = os.Stdout
	reviewCmd.Stderr = os.Stderr
	_ = reviewCmd.Run() // non-fatal — show result regardless of exit code

	// Only offer commit if there are actually uncommitted changes
	if !hasChanges {
		fmt.Println()
		fmt.Println("  ─────────────────────────────────────────────")
		fmt.Println()
		fmt.Println("  Want more? Try:")
		fmt.Println("    kb review run    — review any diff")
		fmt.Println("    kb commit commit — AI commit message")
		fmt.Println()
		return nil
	}

	fmt.Println()
	fmt.Println("  Want me to write the commit message for these changes?")
	fmt.Println("  Requires AI — your diff will be sent to KB Labs Gateway if enabled.")
	fmt.Println()
	fmt.Print("  Try it?  y / n  → ")

	answer, _ := readLine()
	answer = strings.TrimSpace(strings.ToLower(answer))
	if answer != "y" {
		fmt.Println()
		fmt.Println("  Run anytime: kb commit commit")
		fmt.Println()
		return nil
	}

	fmt.Println()

	commitCmd := exec.CommandContext(ctx, kbPath, "commit", "commit") // #nosec G204
	commitCmd.Dir = projectDir
	commitCmd.Stdin = os.Stdin
	commitCmd.Stdout = os.Stdout
	commitCmd.Stderr = os.Stderr
	if err := commitCmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "  commit: %v\n", err)
	}

	return nil
}

// RunFirstCommit is kept for backwards compatibility.
// New code should use RunFirstDemo.
func RunFirstCommit(projectDir string) error {
	return RunFirstDemo(projectDir, false)
}

// isGitRepo returns true if projectDir is inside a git repository.
func isGitRepo(dir string) bool {
	cmd := exec.CommandContext(context.Background(), "git", "rev-parse", "--git-dir")
	cmd.Dir = dir
	return cmd.Run() == nil
}

// hasCommits returns true if the repo has at least one commit.
func hasCommits(dir string) bool {
	cmd := exec.CommandContext(context.Background(), "git", "rev-parse", "HEAD")
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
