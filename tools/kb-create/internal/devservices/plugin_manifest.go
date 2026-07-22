package devservices

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

// PluginManifest mirrors the subset of a plugin's ManifestV3 (kb.plugin/*)
// that the installer needs at install time: which platform capabilities it
// requires vs. merely benefits from, which env vars it cares about, and
// where its section lives in kb.config.json. Decoupled from
// @kb-labs/plugin-contracts to avoid cross-language coupling — the JSON on
// disk (emitted by the shared devkit tsup preset's onSuccess hook) is
// authoritative.
type PluginManifest struct {
	Schema  string `json:"schema"`
	ID      string `json:"id"`
	Version string `json:"version"`
	Display struct {
		Name        string   `json:"name"`
		Description string   `json:"description"`
		Tags        []string `json:"tags"`
	} `json:"display"`
	Platform struct {
		Requires []string `json:"requires"`
		Optional []string `json:"optional"`
	} `json:"platform"`
	Permissions struct {
		Env struct {
			Read []string `json:"read"`
		} `json:"env"`
	} `json:"permissions"`
	ConfigSection string `json:"configSection"`
}

// LoadPluginManifest reads and parses a plugin's dist/manifest.json from an
// installed package tree. Unlike LoadManifest (service schema), this never
// executes JS/Node — it's plain file I/O, by design, so kb-create can read
// plugin install metadata without a Node dependency.
func LoadPluginManifest(path string) (*PluginManifest, error) {
	data, err := os.ReadFile(path) //nolint:gosec // path owned by caller
	if err != nil {
		return nil, fmt.Errorf("read plugin manifest %s: %w", path, err)
	}
	var m PluginManifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parse plugin manifest %s: %w", path, err)
	}
	if !strings.HasPrefix(m.Schema, "kb.plugin/") {
		return nil, fmt.Errorf("unsupported plugin manifest schema %q in %s", m.Schema, path)
	}
	if m.ID == "" {
		return nil, fmt.Errorf("plugin manifest at %s has empty id", path)
	}
	return &m, nil
}
