package devservices

import (
	"encoding/json"
	"fmt"
	"os"
)

// LoadAdapterRoles reads the canonical capability/role-name list emitted by
// core/plugin-runtime's build (dist/adapter-roles.json, a plain JSON array
// derived from ADAPTER_REGISTRY_KEYS). Decoupled from the TS source the same
// way PluginManifest/ServiceManifest are — the JSON on disk is authoritative,
// no Node execution involved.
func LoadAdapterRoles(path string) ([]string, error) {
	data, err := os.ReadFile(path) //nolint:gosec // path owned by caller
	if err != nil {
		return nil, fmt.Errorf("read adapter roles %s: %w", path, err)
	}
	var roles []string
	if err := json.Unmarshal(data, &roles); err != nil {
		return nil, fmt.Errorf("parse adapter roles %s: %w", path, err)
	}
	return roles, nil
}
