package claude

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Manifest mirrors assets/claude/manifest.json shipped by @kb-labs/devkit.
//
// Field names match the on-disk JSON exactly. Adding fields here is
// backwards-compatible because unknown fields on disk are ignored by
// json.Unmarshal — but make sure to bump SchemaVersion when changing
// the meaning of any existing field.
type Manifest struct {
	SchemaVersion  int          `json:"schemaVersion"`
	DevkitVersion  string       `json:"devkitVersion"`
	PlatformCompat string       `json:"platformCompat"`
	ClaudeMd       ClaudeMdSpec `json:"claudeMd"`
	Skills         []SkillSpec  `json:"skills"`
}

// ClaudeMdSpec describes how the managed CLAUDE.md section is rendered.
type ClaudeMdSpec struct {
	SnippetPath string `json:"snippetPath"`
	MarkerID    string `json:"markerId"`
}

// SkillSpec describes a single skill shipped by devkit.
type SkillSpec struct {
	ID          string `json:"id"`
	Path        string `json:"path"` // relative to assets/claude root
	Version     string `json:"version"`
	Description string `json:"description"`
}

// ReadManifest loads and validates the manifest from the given assets directory.
//
// assetsDir is the absolute path to assets/claude (the directory that
// directly contains manifest.json). The manifest is validated minimally —
// schemaVersion must be supported, the snippet path must be set, and every
// skill must have an id starting with "kb-labs-".
func ReadManifest(assetsDir string) (*Manifest, error) {
	path := filepath.Join(assetsDir, "manifest.json")
	// #nosec G304 -- assetsDir is resolved by source.go from a known platform layout.
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read manifest: %w", err)
	}

	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidManifest, err)
	}

	if m.SchemaVersion != 1 {
		return nil, fmt.Errorf("%w: unsupported schemaVersion %d (expected 1)", ErrInvalidManifest, m.SchemaVersion)
	}
	if m.ClaudeMd.SnippetPath == "" {
		return nil, fmt.Errorf("%w: claudeMd.snippetPath is required", ErrInvalidManifest)
	}
	if m.ClaudeMd.MarkerID == "" {
		m.ClaudeMd.MarkerID = "kb-labs"
	}
	for i, s := range m.Skills {
		if s.ID == "" || s.Path == "" {
			return nil, fmt.Errorf("%w: skill[%d] missing id or path", ErrInvalidManifest, i)
		}
		if !isKbLabsSkillID(s.ID) {
			return nil, fmt.Errorf("%w: skill[%d] id %q must start with %q", ErrInvalidManifest, i, s.ID, kbLabsSkillPrefix)
		}
	}

	return &m, nil
}
