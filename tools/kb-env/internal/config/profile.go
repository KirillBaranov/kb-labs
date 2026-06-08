// Package config loads testbed profiles — declarative definitions of which
// plugins to install, which services to run, and which config overlay to apply.
package config

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"gopkg.in/yaml.v3"
)

// Testbed is the parsed testbed.yaml: a named map of environment profiles.
type Testbed struct {
	SchemaVersion int                `yaml:"schemaVersion"`
	Profiles      map[string]Profile `yaml:"profiles"`

	// SourceDir is the directory of the testbed file, used to resolve a
	// profile's relative `config:` overlay path. Empty for embedded defaults.
	SourceDir string `yaml:"-"`
}

// OverlayPath resolves a profile's config overlay to an absolute path. Returns
// "" when the profile declares no overlay, and an error if an overlay is set on
// the embedded testbed (which has no on-disk directory).
func (t *Testbed) OverlayPath(p Profile) (string, error) {
	if p.Config == "" {
		return "", nil
	}
	if t.SourceDir == "" {
		return "", fmt.Errorf("profile sets config %q but testbed is embedded; add e2e/testbed/testbed.yaml", p.Config)
	}
	return filepath.Join(t.SourceDir, p.Config), nil
}

// Profile declares one environment's desired shape.
type Profile struct {
	Description string   `yaml:"description"`
	Plugins     []string `yaml:"plugins"`  // plugin ids to install (kb-create)
	Services    []string `yaml:"services"` // service ids to run (kb-dev start)
	Config      string   `yaml:"config"`   // path to overlay.jsonc, relative to testbed file (Phase 2)
	Mode        string   `yaml:"mode"`     // "dev-manifest" (default) | "verdaccio" | "released"
}

// Parse decodes testbed.yaml bytes and validates the schema version.
func Parse(data []byte) (*Testbed, error) {
	var t Testbed
	if err := yaml.Unmarshal(data, &t); err != nil {
		return nil, fmt.Errorf("parse testbed: %w", err)
	}
	if t.SchemaVersion != 1 {
		return nil, fmt.Errorf("unsupported testbed schemaVersion %d (want 1)", t.SchemaVersion)
	}
	if len(t.Profiles) == 0 {
		return nil, fmt.Errorf("testbed declares no profiles")
	}
	return &t, nil
}

// Load reads a testbed file from an explicit path.
func Load(path string) (*Testbed, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read testbed %s: %w", path, err)
	}
	t, err := Parse(data)
	if err != nil {
		return nil, err
	}
	t.SourceDir = filepath.Dir(path)
	return t, nil
}

// Discover returns the repo testbed (e2e/testbed/testbed.yaml) if present,
// otherwise the embedded defaults. source describes which was used.
func Discover(workspaceRoot string) (t *Testbed, source string, err error) {
	repo := filepath.Join(workspaceRoot, "e2e", "testbed", "testbed.yaml")
	if _, statErr := os.Stat(repo); statErr == nil {
		t, err = Load(repo)
		return t, repo, err
	}
	t, err = Parse(embeddedTestbed)
	return t, "embedded", err
}

// Get resolves a profile by name with a helpful error listing the alternatives.
func (t *Testbed) Get(name string) (Profile, error) {
	p, ok := t.Profiles[name]
	if !ok {
		return Profile{}, fmt.Errorf("unknown profile %q; available: %v", name, t.Names())
	}
	return p, nil
}

// Names returns profile names in stable sorted order.
func (t *Testbed) Names() []string {
	names := make([]string, 0, len(t.Profiles))
	for n := range t.Profiles {
		names = append(names, n)
	}
	sort.Strings(names)
	return names
}
