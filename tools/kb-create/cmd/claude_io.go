package cmd

import (
	"bufio"
	"fmt"
	"os"
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

// printClaudeSummary renders a compact summary of what claude.Install/Update did.
// It is intentionally minimal: a one-line section header plus up to two bullets.
func printClaudeSummary(out output, r *claude.Result) {
	if r == nil {
		return
	}
	added, updated, removed := len(r.SkillsAdded), len(r.SkillsUpdated), len(r.SkillsRemoved)
	if added+updated+removed == 0 && (r.ClaudeMdAction == "" || r.ClaudeMdAction == "skipped" || r.ClaudeMdAction == "unchanged") {
		// Nothing interesting happened — stay silent to keep install output tidy.
		return
	}

	out.Section("Claude Code assets")

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
		out.KeyValue("Skills", strings.Join(parts, ", "))
	}

	if r.ClaudeMdAction != "" && r.ClaudeMdAction != "skipped" && r.ClaudeMdAction != "unchanged" {
		label := claudeMdActionLabel(r.ClaudeMdAction, r.DevkitVersion)
		out.KeyValue("CLAUDE.md", label)
	}
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
