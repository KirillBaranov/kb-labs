package claude

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// claudeMdRelPath is the path of CLAUDE.md relative to the project root.
const claudeMdRelPath = "CLAUDE.md"

// markedSectionRe matches a managed KB Labs section in CLAUDE.md, regardless
// of which version string sits in the BEGIN marker. (?ms) enables
// dot-matches-newline so the body in between is captured.
var markedSectionRe = regexp.MustCompile(`(?ms)<!-- BEGIN: KB Labs[^>]*-->.*?<!-- END: KB Labs[^>]*-->`)

// mergeClaudeMd applies the managed section to projectDir/CLAUDE.md.
//
// It returns:
//   - action: one of "created" | "updated" | "merged" | "unchanged" | "skipped"
//   - createdFile: true when the function created CLAUDE.md from scratch
//   - err: only for I/O failures; "user declined" is reported via action="skipped"
//
// The three on-disk cases are handled as follows:
//
//  1. CLAUDE.md does not exist
//     → write a new file with a header and the managed section.
//     action="created", createdFile=true.
//
//  2. CLAUDE.md exists with managed markers
//     → replace the marked block in place. Surrounding content is untouched.
//     action="updated" if the bytes change, "unchanged" otherwise.
//
//  3. CLAUDE.md exists without markers
//     → ask Prompter (or default per Yes flag). If accepted, append the
//     managed section at the end with a blank-line separator. action="merged".
//     If declined, action="skipped".
func mergeClaudeMd(projectDir, assetsDir string, m *Manifest, _ *State, yes bool, prompter Prompter) (action string, createdFile bool, err error) {
	snippetPath := filepath.Join(assetsDir, m.ClaudeMd.SnippetPath)
	// #nosec G304 -- snippetPath is built from a validated assetsDir + manifest field.
	snippetBody, err := os.ReadFile(snippetPath)
	if err != nil {
		return "skipped", false, fmt.Errorf("read snippet: %w", err)
	}
	snippet := strings.TrimRight(string(snippetBody), "\n")
	managedBlock := renderManagedSection(snippet, m.DevkitVersion)

	mdPath := filepath.Join(projectDir, claudeMdRelPath)
	// #nosec G304 -- projectDir is provided by the caller (the launcher).
	existing, err := os.ReadFile(mdPath)
	switch {
	case errors.Is(err, os.ErrNotExist):
		body := "# CLAUDE.md\n\n" + managedBlock + "\n"
		if writeErr := writeFileAtomic(mdPath, []byte(body), 0o644); writeErr != nil {
			return "skipped", false, writeErr
		}
		return "created", true, nil

	case err != nil:
		return "skipped", false, fmt.Errorf("read CLAUDE.md: %w", err)
	}

	if loc := markedSectionRe.FindIndex(existing); loc != nil {
		replaced := make([]byte, 0, len(existing)+len(managedBlock))
		replaced = append(replaced, existing[:loc[0]]...)
		replaced = append(replaced, managedBlock...)
		replaced = append(replaced, existing[loc[1]:]...)

		if string(replaced) == string(existing) {
			return "unchanged", false, nil
		}
		if writeErr := writeFileAtomic(mdPath, replaced, 0o644); writeErr != nil {
			return "skipped", false, writeErr
		}
		return "updated", false, nil
	}

	// CLAUDE.md exists but has no managed markers — needs user consent.
	accept := false
	switch {
	case yes:
		accept = true
	case prompter != nil:
		if prompter.ConfirmAddClaudeMd(snippet) == ResponseYes {
			accept = true
		}
	}
	if !accept {
		return "skipped", false, nil
	}

	merged := ensureTrailingBlankLine(existing) + managedBlock + "\n"
	if writeErr := writeFileAtomic(mdPath, []byte(merged), 0o644); writeErr != nil {
		return "skipped", false, writeErr
	}
	return "merged", false, nil
}

// stripClaudeMd is the inverse of mergeClaudeMd: it removes the managed
// section from CLAUDE.md, and deletes the file entirely if kb-create created
// it from scratch (state.ClaudeMd.CreatedFile == true) and there is nothing
// else of substance left.
func stripClaudeMd(projectDir string, prev *State) (string, error) {
	mdPath := filepath.Join(projectDir, claudeMdRelPath)
	// #nosec G304 -- projectDir is provided by the caller.
	existing, err := os.ReadFile(mdPath)
	if errors.Is(err, os.ErrNotExist) {
		return "skipped", nil
	}
	if err != nil {
		return "skipped", fmt.Errorf("read CLAUDE.md: %w", err)
	}

	loc := markedSectionRe.FindIndex(existing)
	if loc == nil {
		return "unchanged", nil
	}

	stripped := make([]byte, 0, len(existing)-(loc[1]-loc[0]))
	stripped = append(stripped, existing[:loc[0]]...)
	stripped = append(stripped, existing[loc[1]:]...)
	stripped = []byte(collapseBlankRuns(string(stripped)))

	if prev != nil && prev.ClaudeMd.CreatedFile && isEffectivelyEmpty(stripped) {
		if rmErr := os.Remove(mdPath); rmErr != nil && !errors.Is(rmErr, os.ErrNotExist) {
			return "skipped", rmErr
		}
		return "removed", nil
	}

	if writeErr := writeFileAtomic(mdPath, stripped, 0o644); writeErr != nil {
		return "skipped", writeErr
	}
	return "updated", nil
}

// renderManagedSection wraps the snippet with versioned BEGIN/END markers.
// The version travels in the BEGIN marker so that future updates can detect
// drift even when the snippet body is unchanged.
func renderManagedSection(snippet, devkitVersion string) string {
	var b strings.Builder
	b.WriteString("<!-- BEGIN: KB Labs v")
	b.WriteString(devkitVersion)
	b.WriteString(" (managed by kb-create) - DO NOT EDIT -->\n")
	b.WriteString(snippet)
	b.WriteString("\n<!-- END: KB Labs (managed) -->")
	return b.String()
}

// ensureTrailingBlankLine returns existing with exactly one trailing blank line
// so the appended managed section is visually separated.
func ensureTrailingBlankLine(existing []byte) string {
	s := strings.TrimRight(string(existing), "\n")
	return s + "\n\n"
}

// collapseBlankRuns turns 3+ consecutive newlines into 2, so that stripping a
// managed section out of the middle of a file does not leave a giant blank gap.
func collapseBlankRuns(s string) string {
	for strings.Contains(s, "\n\n\n\n") {
		s = strings.ReplaceAll(s, "\n\n\n\n", "\n\n\n")
	}
	for strings.Contains(s, "\n\n\n") {
		s = strings.ReplaceAll(s, "\n\n\n", "\n\n")
	}
	return s
}

// isEffectivelyEmpty reports whether the file would only contain whitespace
// and a default header after stripping the managed section.
func isEffectivelyEmpty(b []byte) bool {
	s := strings.TrimSpace(string(b))
	if s == "" {
		return true
	}
	if s == "# CLAUDE.md" {
		return true
	}
	return false
}
