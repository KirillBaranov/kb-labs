package handlers

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/kb-labs/create/internal/engine/config"
)

// migrateLegacyProjectConfig promotes the retired project JSON format to the
// declarative JSONC pointer without discarding user-owned configuration. The
// old renderer performed this migration as part of finalization; the engine
// owns it now because it is the sole writer of the generated project pointer.
func migrateLegacyProjectConfig(assembly config.ConfigAssembly, roots config.Roots) error {
	projectRoot := roots[config.RootProject]
	if projectRoot == "" {
		return nil
	}
	kbDir := filepath.Join(projectRoot, ".kb")
	legacyPath := filepath.Join(kbDir, "kb.config.json")
	legacyData, err := os.ReadFile(legacyPath) // #nosec G304 -- project root is validated by the config assembly.
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read legacy project config: %w", err)
	}
	var legacy map[string]any
	if err := json.Unmarshal(legacyData, &legacy); err != nil {
		return fmt.Errorf("parse legacy project config: %w", err)
	}

	targetPath := filepath.Join(kbDir, "kb.config.jsonc")
	targetData, err := os.ReadFile(targetPath) // #nosec G304 -- path is under validated project root.
	if err != nil {
		return fmt.Errorf("read generated project config: %w", err)
	}
	var generated map[string]any
	if err := json.Unmarshal(targetData, &generated); err != nil {
		return fmt.Errorf("parse generated project config: %w", err)
	}

	migrated := mergeProjectConfig(generated, legacy)
	if platform, ok := generated["platform"].(map[string]any); ok {
		migrated["platform"] = platform
	}
	reconcileLegacyRoutes(migrated, enabledServices(assembly.Patches))
	encoded, err := json.MarshalIndent(migrated, "", "  ")
	if err != nil {
		return fmt.Errorf("encode migrated project config: %w", err)
	}
	encoded = append(encoded, '\n')

	backupPath := legacyPath + ".bak-" + time.Now().UTC().Format("20060102T150405.000000000Z")
	if err := os.WriteFile(backupPath, legacyData, 0o644); err != nil { // #nosec G306 -- backup preserves the readable config format.
		return fmt.Errorf("backup legacy project config: %w", err)
	}
	if err := os.WriteFile(targetPath, encoded, 0o644); err != nil { // #nosec G306 -- project config is user-readable.
		return fmt.Errorf("write migrated project config: %w", err)
	}
	if err := os.Remove(legacyPath); err != nil {
		return fmt.Errorf("retire legacy project config: %w", err)
	}
	return nil
}

func mergeProjectConfig(base, legacy map[string]any) map[string]any {
	merged := make(map[string]any, len(base)+len(legacy))
	for key, value := range base {
		merged[key] = value
	}
	for key, value := range legacy {
		baseMap, baseOK := merged[key].(map[string]any)
		legacyMap, legacyOK := value.(map[string]any)
		if baseOK && legacyOK {
			merged[key] = mergeProjectConfig(baseMap, legacyMap)
			continue
		}
		merged[key] = value
	}
	return merged
}

func enabledServices(patches []config.ConfigPatch) map[string]bool {
	services := make(map[string]bool)
	for _, patch := range patches {
		const prefix = "/services/"
		if patch.Scope != config.ScopePlatform || patch.Operation != config.OperationSet || len(patch.Path) <= len(prefix) || patch.Path[:len(prefix)] != prefix {
			continue
		}
		var enabled bool
		if json.Unmarshal(patch.Value, &enabled) == nil {
			services[patch.Path[len(prefix):]] = enabled
		}
	}
	return services
}

func reconcileLegacyRoutes(document map[string]any, services map[string]bool) {
	gateway, _ := document["gateway"].(map[string]any)
	upstreams, _ := gateway["upstreams"].(map[string]any)
	if gateway == nil || upstreams == nil {
		return
	}
	ids := make([]string, 0, len(upstreams))
	for id := range upstreams {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	filtered := make(map[string]any, len(ids))
	prefixes := make(map[string]bool)
	for _, id := range ids {
		route, ok := upstreams[id].(map[string]any)
		if !ok {
			continue
		}
		serviceID, serviceOK := route["serviceId"].(string)
		prefix, prefixOK := route["prefix"].(string)
		if !serviceOK || !prefixOK || !services[serviceID] || prefixes[prefix] {
			continue
		}
		prefixes[prefix] = true
		filtered[id] = route
	}
	gateway["upstreams"] = filtered
}
