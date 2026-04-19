// Package demo orchestrates the post-install first-run experience.
// After installation completes, it runs a quick review on any staged or
// unstaged changes and offers an AI commit — giving the user a "wow moment"
// on their own code without any extra configuration.
//
// The demo is intentional: it only runs when there is something real to show
// (uncommitted changes). Empty repos or fully-committed projects get a plain
// "try it now" hint instead of a failing or empty review output.
package demo

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
)

// RunFirstDemo is the post-install entry point.
// It looks for uncommitted changes to review, then offers a commit.
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

	// Only run the review demo when there are tracked modified/staged files —
	// untracked-only repos (fresh project, just git init) have nothing for
	// `git diff` to show, so the review would fail with "no changed files".
	reviewable, _ := reviewableCount(projectDir)
	if reviewable == 0 {
		// Nothing to review — show instructions only.
		fmt.Println()
		fmt.Println("  ─────────────────────────────────────────────")
		fmt.Println()
		fmt.Println("  Try it now:")
		fmt.Println()
		fmt.Println("    kb review run     — review staged or changed code")
		fmt.Println("    kb commit commit  — generate a commit message")
		fmt.Println()
		if !llmEnabled {
			fmt.Println("  💡 Enable AI review for deeper analysis (security, logic, style):")
			fmt.Println("     kb-create . --llm   — 50 free requests, no API key needed")
			fmt.Println()
		}
		return nil
	}

	// Has reviewable changes — run a live review to show the product.
	noun := "change"
	if reviewable != 1 {
		noun = "changes"
	}

	fmt.Println()
	fmt.Println("  ─────────────────────────────────────────────")
	fmt.Printf("  ✦  Found %d %s — here's what review looks like:\n", reviewable, noun)
	fmt.Println()

	mode := "heuristic"
	if llmEnabled {
		mode = "llm"
	}

	ctx := context.Background()
	reviewCmd := exec.CommandContext(ctx, kbPath, "review", "run", "--mode="+mode, "--scope=changed") // #nosec G204
	reviewCmd.Dir = projectDir

	// Capture output to detect if heuristic found nothing (no engines ran).
	var reviewOut bytes.Buffer
	reviewCmd.Stdout = io.MultiWriter(os.Stdout, &reviewOut)
	reviewCmd.Stderr = os.Stderr
	_ = reviewCmd.Run() // non-fatal

	fmt.Println()
	fmt.Println("  Next:")
	fmt.Println("    kb commit commit  — generate a commit message for these changes")
	fmt.Println()

	// If heuristic review ran and found nothing, nudge towards LLM.
	// "Engines:" being empty in the output means no linter ran.
	if !llmEnabled {
		out := reviewOut.String()
		if strings.Contains(out, "Found 0 issue") || strings.Contains(out, "Engines:\n") {
			fmt.Println("  💡 Heuristic review needs ESLint/Ruff in your project.")
			fmt.Println("     Enable AI review for deeper analysis (security, logic, style):")
			fmt.Println("     kb-create . --llm   — 50 free requests, no API key needed")
			fmt.Println()
		}
	}

	return nil
}

// CommitPlatformFiles commits all KB Labs-owned files that were added during
// installation. This prevents them from showing up in the user's next
// `kb commit commit` run and polluting their git history.
// Non-fatal: errors are silently swallowed.
func CommitPlatformFiles(projectDir string) error {
	if !isGitRepo(projectDir) {
		return nil
	}

	// Patterns for files owned by KB Labs installer.
	ownedPatterns := []string{
		".kb/",
		".claude/",
		".gitignore",
		"CLAUDE.md",
	}

	// Stage only the owned files/dirs that actually exist.
	staged := false
	for _, pattern := range ownedPatterns {
		addCmd := exec.CommandContext(context.Background(), "git", "add", "--", pattern) // #nosec G204
		addCmd.Dir = projectDir
		if err := addCmd.Run(); err == nil {
			staged = true
		}
	}
	if !staged {
		return nil
	}

	// Check if there's anything actually staged.
	diffCmd := exec.CommandContext(context.Background(), "git", "diff", "--cached", "--quiet")
	diffCmd.Dir = projectDir
	if diffCmd.Run() == nil {
		// Nothing staged — nothing to commit.
		return nil
	}

	commitCmd := exec.CommandContext( // #nosec G204
		context.Background(),
		"git", "commit", "-m", "chore: add KB Labs platform",
	)
	commitCmd.Dir = projectDir
	commitCmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=KB Labs",
		"GIT_AUTHOR_EMAIL=noreply@kb-labs.dev",
		"GIT_COMMITTER_NAME=KB Labs",
		"GIT_COMMITTER_EMAIL=noreply@kb-labs.dev",
	)
	_ = commitCmd.Run()
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

// reviewableExtensions mirrors the list in review-core's isReviewableFile.
// Only files with these extensions are picked up by `kb review run`.
var reviewableExtensions = []string{
	".ts", ".tsx", ".js", ".jsx",
	".py", ".go", ".rs",
	".java", ".kt", ".swift",
	".rb", ".php",
	".c", ".cpp", ".h", ".hpp", ".cs",
}

func isReviewableFile(name string) bool {
	for _, ext := range reviewableExtensions {
		if strings.HasSuffix(name, ext) {
			return true
		}
	}
	return false
}

// reviewableCount returns the number of tracked modified/staged files that
// `kb review run --scope=changed` can actually show (code files only).
// Untracked (??) and non-code files are excluded.
func reviewableCount(dir string) (int, error) {
	cmd := exec.CommandContext(context.Background(), "git", "status", "--porcelain")
	cmd.Dir = dir
	out, err := cmd.Output()
	if err != nil {
		return 0, err
	}
	count := 0
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line == "" || strings.HasPrefix(line, "??") {
			continue
		}
		// Porcelain format: "XY filename" (possibly with rename "old -> new")
		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}
		filename := parts[len(parts)-1]
		if isReviewableFile(filename) {
			count++
		}
	}
	return count, nil
}
