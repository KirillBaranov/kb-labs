package cmd

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/kb-labs/create/internal/claude"
)

// stdPrompter implements claude.Prompter against stdin/stdout. It is used
// during interactive runs of `kb-create` (default) and `kb-create update`
// when the project already has a CLAUDE.md without managed markers.
//
// The "view" loop lets the user inspect the snippet body before committing
// — important because they cannot easily preview what will be appended.
type stdPrompter struct{}

func (stdPrompter) ConfirmAddClaudeMd(snippet string) claude.PromptResponse {
	for {
		fmt.Println()
		fmt.Println("  Your project has a CLAUDE.md but no KB Labs section.")
		fmt.Print("  Add the managed KB Labs section? [Y/n/v(iew)] ")

		r := bufio.NewReader(os.Stdin)
		line, _ := r.ReadString('\n')
		line = strings.TrimSpace(strings.ToLower(line))

		switch line {
		case "", "y", "yes":
			return claude.ResponseYes
		case "n", "no":
			return claude.ResponseNo
		case "v", "view":
			fmt.Println()
			fmt.Println("  ── snippet ────────────────────────────────────────────────")
			for _, line := range strings.Split(snippet, "\n") {
				fmt.Println("    " + line)
			}
			fmt.Println("  ───────────────────────────────────────────────────────────")
			continue
		default:
			fmt.Println("  please answer y, n, or v")
		}
	}
}

// printClaudeSummary shows the exact additive changes after setup completes.
func printClaudeSummary(projectDir string, r *claude.Result) {
	if r == nil {
		return
	}
	printRailNotice("Agent tools installed", claudeSummaryLines(projectDir, r))
	fmt.Println()
}

func claudeSummaryLines(projectDir string, r *claude.Result) []string {
	added, updated, removed := len(r.SkillsAdded), len(r.SkillsUpdated), len(r.SkillsRemoved)
	lines := make([]string, 0, 4)
	if added+updated+removed > 0 {
		parts := make([]string, 0, 3)
		if added > 0 {
			parts = append(parts, fmt.Sprintf("+%d added", added))
		}
		if updated > 0 {
			parts = append(parts, fmt.Sprintf("~%d updated", updated))
		}
		if removed > 0 {
			parts = append(parts, fmt.Sprintf("-%d removed", removed))
		}
		lines = append(lines, railKeyValue("Skills", strings.Join(parts, ", ")))
		lines = append(lines, "Location  "+filepath.Join(projectDir, ".claude", "skills", "kb-labs-*"))
	} else {
		lines = append(lines, "Skills are already up to date in "+filepath.Join(projectDir, ".claude", "skills", "kb-labs-*"))
	}

	if r.ClaudeMdAction != "" && r.ClaudeMdAction != "skipped" && r.ClaudeMdAction != "unchanged" {
		label := claudeMdActionLabel(r.ClaudeMdAction, r.DevkitVersion)
		lines = append(lines, railKeyValue("CLAUDE.md", label))
		lines = append(lines, "Location  "+filepath.Join(projectDir, "CLAUDE.md"))
	} else if r.ClaudeMdAction == "skipped" {
		lines = append(lines, "CLAUDE.md was left unchanged.")
	}
	lines = append(lines, "Existing content and non-KB Labs skills were preserved.")
	return lines
}

func claudeMdActionLabel(action, version string) string {
	switch action {
	case "created":
		return fmt.Sprintf("created (managed section v%s)", version)
	case "merged":
		return fmt.Sprintf("appended managed section (v%s)", version)
	case "updated":
		return fmt.Sprintf("updated managed section to v%s", version)
	case "removed":
		return "removed (file was created by kb-create)"
	default:
		return action
	}
}
