package claude

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// stateSchemaVersion is the on-disk schema version for .claude/.kb-labs.json.
// Bump this when the State struct changes incompatibly.
const stateSchemaVersion = 1

// stateRelPath is the path of the state file relative to the project root.
var stateRelPath = filepath.Join(".claude", ".kb-labs.json")

// State is the persistent record of what kb-create installed under .claude/.
//
// It is the source of truth for diff/uninstall: when the user runs
// `kb-create update`, we compare the new manifest against this state to
// classify each skill as added/updated/removed/unchanged.
type State struct {
	SchemaVersion int             `json:"schemaVersion"`
	DevkitVersion string          `json:"devkitVersion"`
	InstalledAt   time.Time       `json:"installedAt"`
	UpdatedAt     time.Time       `json:"updatedAt"`
	Skills        []SkillState    `json:"skills"`
	ClaudeMd      ClaudeMdState   `json:"claudeMd"`
}

// SkillState records the version and content hash of one installed skill.
// SHA256 lets the updater detect drift even when the version field is
// unchanged (useful when developing locally against a link: devkit).
type SkillState struct {
	ID      string `json:"id"`
	Version string `json:"version"`
	SHA256  string `json:"sha256"`
}

// ClaudeMdState records whether kb-create touched the user's CLAUDE.md
// and how. CreatedFile is true when there was no CLAUDE.md before install
// — uninstall uses this to decide whether the file as a whole can be
// removed (vs only stripping the managed section).
type ClaudeMdState struct {
	Managed     bool   `json:"managed"`
	MarkerID    string `json:"markerId"`
	CreatedFile bool   `json:"createdFile"`
}

// FindSkill returns a pointer to the SkillState entry with the given id, or nil.
func (s *State) FindSkill(id string) *SkillState {
	for i := range s.Skills {
		if s.Skills[i].ID == id {
			return &s.Skills[i]
		}
	}
	return nil
}

// stateFilePath returns the absolute path to the state file for projectDir.
func stateFilePath(projectDir string) string {
	return filepath.Join(projectDir, stateRelPath)
}

// ReadState loads the state file from projectDir. Returns (nil, nil) if the
// file does not exist — that is the normal "first install" case and is not
// an error. Any other read or parse failure is returned to the caller.
func ReadState(projectDir string) (*State, error) {
	path := stateFilePath(projectDir)
	// #nosec G304 -- path is computed from the caller-provided projectDir.
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("read claude state: %w", err)
	}

	var s State
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, fmt.Errorf("parse claude state: %w", err)
	}
	return &s, nil
}

// WriteState persists state atomically to .claude/.kb-labs.json under projectDir.
//
// The write is done via tmp+rename to avoid leaving a half-written state file
// if kb-create is killed mid-write.
func WriteState(projectDir string, s *State) error {
	if s.SchemaVersion == 0 {
		s.SchemaVersion = stateSchemaVersion
	}

	dir := filepath.Join(projectDir, ".claude")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create .claude dir: %w", err)
	}

	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal claude state: %w", err)
	}
	data = append(data, '\n')

	final := stateFilePath(projectDir)
	tmp := final + ".tmp"
	// #nosec G306 -- state file is intentionally world-readable to make it
	// easy for the user to inspect; nothing sensitive is stored here.
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return fmt.Errorf("write claude state tmp: %w", err)
	}
	if err := os.Rename(tmp, final); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("rename claude state: %w", err)
	}
	return nil
}

// RemoveState deletes the state file. Missing file is not an error.
func RemoveState(projectDir string) error {
	err := os.Remove(stateFilePath(projectDir))
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove claude state: %w", err)
	}
	return nil
}
