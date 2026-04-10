package claude

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// kbLabsSkillPrefix is the mandatory prefix for every skill folder kb-create
// installs. Claude Code requires a flat .claude/skills/ layout, so this prefix
// is the only safe namespace boundary — and the only filter we use when
// uninstalling, so we never touch user-authored skills.
const kbLabsSkillPrefix = "kb-labs-"

// isKbLabsSkillID reports whether the given skill id is in the kb-labs namespace.
func isKbLabsSkillID(id string) bool {
	return strings.HasPrefix(id, kbLabsSkillPrefix)
}

// SkillChange describes one transition during a skill copy operation.
type SkillChange struct {
	ID     string
	Action string // "added" | "updated" | "unchanged" | "removed"
}

// copySkills writes every skill listed in m from assetsDir into projectDir/.claude/skills/.
//
// Each skill becomes <projectDir>/.claude/skills/<id>/SKILL.md. The function
// classifies each skill as added/updated/unchanged by comparing its sha256
// against prev (the state from a previous install, may be nil).
//
// Skills present in prev but absent from m are removed (only when their id is
// in the kb-labs namespace) and reported as "removed".
//
// Returns the list of changes and the new SkillState slice that should be
// written to the state file. On any I/O error, the function returns the error
// and the partial change list it managed to apply — callers should still
// persist whatever progress was made.
func copySkills(assetsDir, projectDir string, m *Manifest, prev *State) ([]SkillChange, []SkillState, error) {
	skillsRoot := filepath.Join(projectDir, ".claude", "skills")
	if err := os.MkdirAll(skillsRoot, 0o755); err != nil {
		return nil, nil, fmt.Errorf("create .claude/skills dir: %w", err)
	}

	changes := make([]SkillChange, 0, len(m.Skills))
	newStates := make([]SkillState, 0, len(m.Skills))

	wantIDs := make(map[string]bool, len(m.Skills))
	for _, spec := range m.Skills {
		wantIDs[spec.ID] = true

		srcPath := filepath.Join(assetsDir, spec.Path)
		// #nosec G304 -- assetsDir comes from ResolveAssetsDir, spec.Path from
		// the validated manifest. Both are trusted sources.
		body, err := os.ReadFile(srcPath)
		if err != nil {
			return changes, newStates, fmt.Errorf("read skill %s: %w", spec.ID, err)
		}

		sum := sha256.Sum256(body)
		hash := hex.EncodeToString(sum[:])

		action := "added"
		if prev != nil {
			if prevSkill := prev.FindSkill(spec.ID); prevSkill != nil {
				switch {
				case prevSkill.SHA256 == hash:
					action = "unchanged"
				default:
					action = "updated"
				}
			}
		}

		destDir := filepath.Join(skillsRoot, spec.ID)
		if err := os.MkdirAll(destDir, 0o755); err != nil {
			return changes, newStates, fmt.Errorf("create skill dir %s: %w", spec.ID, err)
		}

		destFile := filepath.Join(destDir, "SKILL.md")
		if err := writeFileAtomic(destFile, body, 0o644); err != nil {
			return changes, newStates, fmt.Errorf("write skill %s: %w", spec.ID, err)
		}

		changes = append(changes, SkillChange{ID: spec.ID, Action: action})
		newStates = append(newStates, SkillState{
			ID:      spec.ID,
			Version: spec.Version,
			SHA256:  hash,
		})
	}

	// Drop kb-labs skills that are no longer in the manifest.
	if prev != nil {
		for _, prevSkill := range prev.Skills {
			if wantIDs[prevSkill.ID] {
				continue
			}
			if !isKbLabsSkillID(prevSkill.ID) {
				continue
			}
			if err := removeSkillDir(skillsRoot, prevSkill.ID); err != nil {
				return changes, newStates, fmt.Errorf("remove stale skill %s: %w", prevSkill.ID, err)
			}
			changes = append(changes, SkillChange{ID: prevSkill.ID, Action: "removed"})
		}
	}

	return changes, newStates, nil
}

// removeKbLabsSkills deletes every kb-labs-* skill directory under
// projectDir/.claude/skills/. User-authored skills (any folder without the
// prefix) are never touched. Returns the list of removed ids.
func removeKbLabsSkills(projectDir string) ([]string, error) {
	skillsRoot := filepath.Join(projectDir, ".claude", "skills")
	entries, err := os.ReadDir(skillsRoot)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("read skills dir: %w", err)
	}

	removed := make([]string, 0)
	for _, e := range entries {
		if !e.IsDir() || !isKbLabsSkillID(e.Name()) {
			continue
		}
		if err := removeSkillDir(skillsRoot, e.Name()); err != nil {
			return removed, err
		}
		removed = append(removed, e.Name())
	}
	return removed, nil
}

// removeSkillDir removes a single skill folder under skillsRoot. The id is
// validated to enforce the kb-labs namespace before any deletion happens —
// this is the only place we ever rm -rf inside .claude/, so the guard matters.
func removeSkillDir(skillsRoot, id string) error {
	if !isKbLabsSkillID(id) {
		return fmt.Errorf("refusing to remove non-kb-labs skill %q", id)
	}
	dir := filepath.Join(skillsRoot, id)
	// Extra defense-in-depth: make sure the resolved path is still inside
	// skillsRoot (rejects ids containing path separators or "..").
	rel, err := filepath.Rel(skillsRoot, dir)
	if err != nil || rel == "." || strings.Contains(rel, "..") || strings.ContainsRune(rel, filepath.Separator) {
		return fmt.Errorf("refusing to remove skill outside skills root: %q", id)
	}
	if err := os.RemoveAll(dir); err != nil {
		return err
	}
	return nil
}

// writeFileAtomic writes data to path via a tmp+rename so a kill mid-write
// cannot leave a partially-written SKILL.md on disk.
func writeFileAtomic(path string, data []byte, mode os.FileMode) error {
	tmp := path + ".tmp"
	// #nosec G304 -- path is constructed from a validated skill id under projectDir.
	if err := os.WriteFile(tmp, data, mode); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}
