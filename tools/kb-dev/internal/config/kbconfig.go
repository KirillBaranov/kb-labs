package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// reComment matches only whole-line "//" comments (optional leading
// whitespace, then "//" to end of line) — never a "//" that appears after
// other content on the line. This matters because the generated
// kb.config.jsonc embeds real URLs as JSON string values (e.g.
// "url": "http://127.0.0.1:5070"); a comment stripper that matches "//"
// anywhere would truncate those lines mid-string and produce invalid JSON.
var reComment = regexp.MustCompile(`(?m)^[ \t]*//[^\n]*\n?`)

// reTrailingComma matches a "," immediately followed (across whitespace) by a
// closing "}" or "]". kb-create's generated kb.config.jsonc legitimately
// contains these (e.g. the plugins section always ends with a trailing comma
// before the following section) — its own reader strips them too (see
// the V2 launcher renderer); any
// reader in this file must do the same or json.Unmarshal fails.
var reTrailingComma = regexp.MustCompile(`,(\s*[}\]])`)

// stripJSONC removes whole-line "//" comments and trailing commas so the
// result can be parsed with encoding/json. Mirrors kb-create's
// stripGeneratedJsonc closely enough for the subset of JSONC this generated
// file actually uses (no "/* */" blocks, no "//" inside string values).
func stripJSONC(data []byte) string {
	stripped := reComment.ReplaceAllString(string(data), "")
	stripped = reTrailingComma.ReplaceAllString(stripped, "$1")
	return strings.TrimSpace(stripped)
}

// FindPlatformDir walks upward from dir looking for .kb/kb.config.jsonc.
// If found and the file contains platform.dir, that directory is returned.
// Returns empty string if nothing is found or the field is absent.
func FindPlatformDir(dir string) string {
	abs := dir
	for {
		candidate := filepath.Join(abs, ".kb", "kb.config.jsonc")
		if data, err := os.ReadFile(candidate); err == nil {
			if dir := extractPlatformDir(data); dir != "" {
				return dir
			}
		}
		parent := filepath.Dir(abs)
		if parent == abs {
			break
		}
		abs = parent
	}
	return ""
}

// extractPlatformDir strips comments from JSONC and reads platform.dir.
func extractPlatformDir(data []byte) string {
	stripped := stripJSONC(data)

	var v struct {
		Platform struct {
			Dir string `json:"dir"`
		} `json:"platform"`
	}
	if err := json.Unmarshal([]byte(stripped), &v); err != nil {
		return ""
	}
	return v.Platform.Dir
}

// ResolvePlatformDir finds "the platform" a kb-dev subcommand should act on,
// trying (in order):
//
//  1. an explicit override (pass "" to skip — callers wire this to a flag/env)
//  2. cwd's own project → kb.config.jsonc "platform.dir" (works when invoked
//     from inside any registered project)
//  3. ~/.kb/active-platform, the pointer kb-create writes on install/update —
//     lets commands like `kb-dev switch` work from anywhere, not just from
//     inside a project directory.
//
// Returns an error if none resolve, since callers (register/switch/projects)
// have nothing to act on without a platform directory.
func ResolvePlatformDir(explicit string) (string, error) {
	if explicit != "" {
		return explicit, nil
	}

	if cwd, err := os.Getwd(); err == nil {
		if dir := FindPlatformDir(cwd); dir != "" {
			return dir, nil
		}
	}

	if dir := readActivePlatformPointer(); dir != "" {
		return dir, nil
	}

	return "", fmt.Errorf(
		"cannot determine the KB Labs platform directory — " +
			"run this from inside a registered project, or pass --platform-dir, " +
			"or re-run `kb-create update` to refresh ~/.kb/active-platform",
	)
}

// readActivePlatformPointer reads ~/.kb/active-platform (written by kb-create
// on install/update). Returns "" if absent or unreadable.
func readActivePlatformPointer() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	data, err := os.ReadFile(filepath.Join(home, ".kb", "active-platform")) // #nosec G304 -- fixed, user-owned path
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

// ReadDevSwitchAutoHook reads projectDir/.kb/kb.config.json's devSwitch.autoHook
// opt-in flag. False on any error or absence (missing file, missing field,
// malformed JSON) — the auto-hook feature is opt-in by construction, so any
// ambiguity resolves to "do nothing", never to an unexpected auto-switch.
func ReadDevSwitchAutoHook(projectDir string) bool {
	path := filepath.Join(projectDir, ".kb", "kb.config.json")
	data, err := os.ReadFile(path) // #nosec G304 -- projectDir is caller-resolved, not attacker input
	if err != nil {
		return false
	}

	// This file is nominally plain JSON, but strip comments/trailing commas
	// defensively — cheap, and keeps this reader consistent with kb.config.jsonc's.
	stripped := stripJSONC(data)

	var v struct {
		DevSwitch struct {
			AutoHook bool `json:"autoHook"`
		} `json:"devSwitch"`
	}
	if err := json.Unmarshal([]byte(stripped), &v); err != nil {
		return false
	}
	return v.DevSwitch.AutoHook
}

// projectsStartMarker / projectsEndMarker bound the "projects" registry block
// inside a generated kb.config.jsonc (see tools/kb-create scaffold.go
// renderProjectsSection). WriteProjects locates them via plain string search
// and splices in place, leaving the rest of the hand-templated file (and its
// comments) untouched.
const (
	projectsStartMarker = "// kb-dev:projects:start"
	projectsEndMarker   = "// kb-dev:projects:end"
)

// ReadProjects reads the "projects" alias→path registry from
// platformDir/.kb/kb.config.jsonc. Returns an empty (non-nil) map if the file
// or field is absent — that's a valid "nothing registered yet" state, not an error.
func ReadProjects(platformDir string) (map[string]string, error) {
	path := filepath.Join(platformDir, ".kb", "kb.config.jsonc")
	data, err := os.ReadFile(path) // #nosec G304 -- platformDir is caller-resolved, not attacker input
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]string{}, nil
		}
		return nil, fmt.Errorf("read kb.config.jsonc: %w", err)
	}

	stripped := stripJSONC(data)
	var v struct {
		Projects map[string]string `json:"projects"`
	}
	if err := json.Unmarshal([]byte(stripped), &v); err != nil {
		return nil, fmt.Errorf("parse kb.config.jsonc: %w", err)
	}
	if v.Projects == nil {
		v.Projects = map[string]string{}
	}
	return v.Projects, nil
}

// WriteProjects splices a new "projects" registry into
// platformDir/.kb/kb.config.jsonc, replacing only the content between the
// projectsStartMarker/projectsEndMarker sentinel lines. It never re-parses or
// re-renders the rest of the file, so hand-written comments and formatting
// elsewhere survive untouched.
//
// Returns an error if the file has no projects block — that means it predates
// this feature; the fix is `kb-create update` (which now always renders one).
func WriteProjects(platformDir string, projects map[string]string) error {
	path := filepath.Join(platformDir, ".kb", "kb.config.jsonc")
	data, err := os.ReadFile(path) // #nosec G304 -- platformDir is caller-resolved, not attacker input
	if err != nil {
		return fmt.Errorf("read kb.config.jsonc: %w", err)
	}
	content := string(data)

	startIdx := strings.Index(content, projectsStartMarker)
	endIdx := strings.Index(content, projectsEndMarker)
	if startIdx < 0 || endIdx < 0 || endIdx < startIdx {
		// Declarative kb-create output is valid JSONC and materializes the
		// projects object without the legacy comment sentinels. Update that
		// object semantically instead of requiring formatting markers.
		cleaned := stripJSONC(data)
		var document map[string]any
		if err := json.Unmarshal([]byte(cleaned), &document); err != nil {
			return fmt.Errorf("%s has no projects registry block — run `kb-create update` to add it", path)
		}
		if _, ok := document["projects"]; !ok {
			return fmt.Errorf("%s has no projects registry block — run `kb-create update` to add it", path)
		}
		document["projects"] = projects
		updated, err := json.MarshalIndent(document, "", "  ")
		if err != nil {
			return fmt.Errorf("marshal projects registry: %w", err)
		}
		updated = append(updated, '\n')
		if err := os.WriteFile(path, updated, 0o644); err != nil {
			return fmt.Errorf("write projects registry: %w", err)
		}
		return nil
	}
	bodyStart := startIdx + len(projectsStartMarker)

	keys := make([]string, 0, len(projects))
	for k := range projects {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var body strings.Builder
	body.WriteString("\n")
	for i, k := range keys {
		comma := ","
		if i == len(keys)-1 {
			comma = ""
		}
		keyJSON, _ := json.Marshal(k)
		valJSON, _ := json.Marshal(projects[k])
		fmt.Fprintf(&body, "    %s: %s%s\n", keyJSON, valJSON, comma)
	}
	body.WriteString("    ")

	newContent := content[:bodyStart] + body.String() + content[endIdx:]
	// #nosec G306 -- platform config is expected to be readable in the workspace.
	return os.WriteFile(path, []byte(newContent), 0o644)
}
