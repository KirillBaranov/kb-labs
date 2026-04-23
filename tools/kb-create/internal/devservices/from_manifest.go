package devservices

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// ServiceManifest mirrors the subset of core/plugin-contracts' ServiceManifest
// kb-create needs to reconstruct a devservices entry. Decoupled from the
// @kb-labs/plugin-contracts TS types to avoid cross-language coupling; the
// JSON on disk is authoritative.
type ServiceManifest struct {
	Schema  string `json:"schema"`
	ID      string `json:"id"`
	Name    string `json:"name"`
	Version string `json:"version"`
	Runtime struct {
		Entry       string `json:"entry"`
		Port        int    `json:"port"`
		HealthCheck string `json:"healthCheck"`
		Protocol    string `json:"protocol,omitempty"`
	} `json:"runtime"`
	DependsOn []string                    `json:"dependsOn,omitempty"`
	Env       map[string]ServiceEnvVar    `json:"env,omitempty"`
	// Fields kb-dev does not care about (description, display, requires) are
	// ignored — their absence from this struct is intentional.
}

// ServiceEnvVar mirrors the env declaration; only defaults are promoted into
// devservices.yaml — required-without-default entries are expected to come
// from the runtime environment (systemd unit, kb-deploy env block, etc.).
type ServiceEnvVar struct {
	Description string `json:"description,omitempty"`
	Default     string `json:"default,omitempty"`
	Required    bool   `json:"required,omitempty"`
}

// LoadManifest reads and parses manifest.json from an installed package tree.
func LoadManifest(path string) (*ServiceManifest, error) {
	data, err := os.ReadFile(path) //nolint:gosec // path owned by caller
	if err != nil {
		return nil, fmt.Errorf("read service manifest %s: %w", path, err)
	}
	var m ServiceManifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parse service manifest %s: %w", path, err)
	}
	if m.Schema != "kb.service/1" {
		return nil, fmt.Errorf("unsupported service manifest schema %q in %s", m.Schema, path)
	}
	if m.ID == "" {
		return nil, fmt.Errorf("service manifest at %s has empty id", path)
	}
	if m.Runtime.Entry == "" {
		return nil, fmt.Errorf("service manifest at %s: runtime.entry is required", path)
	}
	return &m, nil
}

// EntryForSwap builds the devservices.yaml service entry for a freshly-swapped
// release. The command points through the services/<short>/current symlink so
// subsequent swaps take effect on next start without re-editing devservices.yaml.
//
// platformDir:     e.g. /opt/kb-platform
// servicePkg:      npm package name, e.g. "@kb-labs/gateway"
// serviceShort:    directory name under services/, e.g. "gateway"
// manifest:        parsed manifest.json of the just-installed release
func EntryForSwap(platformDir, servicePkg, serviceShort string, manifest *ServiceManifest) (string, Service) {
	// Path relative to services/<short>/current.
	currentRoot := filepath.Join(platformDir, "services", serviceShort, "current")
	nodeModules := filepath.Join(currentRoot, "node_modules", servicePkg)
	entryPath := filepath.Join(nodeModules, manifest.Runtime.Entry)

	env := map[string]string{}
	for k, v := range manifest.Env {
		if v.Default != "" {
			env[k] = v.Default
		}
	}

	url := ""
	healthCheck := manifest.Runtime.HealthCheck
	if manifest.Runtime.Port > 0 && healthCheck != "" && healthCheck[0] == '/' {
		// Expand relative path into a localhost URL so kb-dev's HTTP probe works.
		healthCheck = fmt.Sprintf("http://localhost:%d%s", manifest.Runtime.Port, healthCheck)
		url = fmt.Sprintf("http://localhost:%d", manifest.Runtime.Port)
	}

	return manifest.ID, Service{
		Name:        manifest.Name,
		Type:        "node",
		Command:     "node " + entryPath,
		HealthCheck: healthCheck,
		Port:        manifest.Runtime.Port,
		URL:         url,
		Env:         env,
		DependsOn:   manifest.DependsOn,
	}
}
