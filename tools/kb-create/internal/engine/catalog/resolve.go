package catalog

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

type ResolveOptions struct{ Node string }

type ResolvedEntity struct {
	Manifest EntityManifest `json:"manifest"`
	Digest   string         `json:"digest"`
	Path     string         `json:"path"`
}

// ResolveCatalog builds a technical catalog from package artifacts. The
// caller decides which package directories are in scope; no hand-maintained
// component compatibility table is involved.
func ResolveCatalog(ctx context.Context, packageDirs []string, options ResolveOptions) (Catalog, error) {
	catalog := Catalog{}
	for _, packageDir := range packageDirs {
		resolved, err := ResolvePackage(ctx, packageDir, options)
		if err != nil {
			return Catalog{}, err
		}
		if err := catalog.AddEntity(resolved.Manifest); err != nil {
			return Catalog{}, err
		}
	}
	if err := catalog.Validate(); err != nil {
		return Catalog{}, err
	}
	catalog.Digest = Digest(catalog)
	return catalog, nil
}

// ResolvePackage reads the manifest declared by package.json. It evaluates
// only that data module; package commands and plugin handlers are never run.
func ResolvePackage(ctx context.Context, packageDir string, options ResolveOptions) (ResolvedEntity, error) {
	packageDir, err := filepath.Abs(packageDir)
	if err != nil {
		return ResolvedEntity{}, err
	}
	packageData, err := os.ReadFile(filepath.Join(packageDir, "package.json"))
	if err != nil {
		return ResolvedEntity{}, fmt.Errorf("read package metadata: %w", err)
	}
	var metadata struct {
		Name    string `json:"name"`
		Version string `json:"version"`
		KB      struct {
			Manifest string `json:"manifest"`
		} `json:"kb"`
	}
	if err := json.Unmarshal(packageData, &metadata); err != nil {
		return ResolvedEntity{}, fmt.Errorf("decode package metadata: %w", err)
	}
	if metadata.Name == "" || metadata.Version == "" || metadata.KB.Manifest == "" {
		return ResolvedEntity{}, fmt.Errorf("package %q has no complete kb.manifest metadata", packageDir)
	}
	manifestPath, err := filepath.Abs(filepath.Join(packageDir, filepath.FromSlash(metadata.KB.Manifest)))
	if err != nil {
		return ResolvedEntity{}, err
	}
	packageRoot, err := filepath.Abs(packageDir)
	if err != nil {
		return ResolvedEntity{}, err
	}
	relativeManifest, err := filepath.Rel(packageRoot, manifestPath)
	if err != nil || relativeManifest == ".." || strings.HasPrefix(relativeManifest, ".."+string(filepath.Separator)) {
		return ResolvedEntity{}, fmt.Errorf("manifest path escapes package root")
	}
	data, err := loadManifestModule(ctx, manifestPath, options.Node)
	if err != nil {
		return ResolvedEntity{}, err
	}
	manifest, err := NormalizeManifest(data, metadata.Name, metadata.Version)
	if err != nil {
		return ResolvedEntity{}, fmt.Errorf("normalize %s: %w", metadata.Name, err)
	}
	digest := sha256.Sum256(data)
	return ResolvedEntity{Manifest: manifest, Digest: hex.EncodeToString(digest[:]), Path: manifestPath}, nil
}

func loadManifestModule(ctx context.Context, manifestPath, node string) ([]byte, error) {
	if node == "" {
		node = "node"
	}
	script := `const file=process.argv[1];const mod=await import("file://"+file);const value=mod.manifest??mod.default??mod;process.stdout.write(JSON.stringify(value));`
	command := exec.CommandContext(ctx, node, "--input-type=module", "-e", script, manifestPath) // #nosec G204 -- explicit resolver inputs.
	output, err := command.Output()
	if err != nil {
		return nil, fmt.Errorf("load manifest module %q: %w", manifestPath, err)
	}
	return output, nil
}

// NormalizeManifest supports kb.plugin/3, kb.service/1, and AdapterManifest.
func NormalizeManifest(data []byte, packageName, packageVersion string) (EntityManifest, error) {
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return EntityManifest{}, fmt.Errorf("manifest is not JSON: %w", err)
	}
	manifest := EntityManifest{Schema: stringValue(raw["schema"]), ID: stringValue(raw["id"]), Package: packageName, Version: packageVersion, Raw: append(json.RawMessage(nil), data...)}
	if manifest.Schema == "" {
		manifest.Schema = "kb.adapter/1"
	}
	if manifest.ID == "" {
		manifest.ID = packageName
	}
	switch {
	case strings.HasPrefix(manifest.Schema, "kb.plugin/"):
		manifest.Kind = KindPlugin
	case strings.HasPrefix(manifest.Schema, "kb.service/"):
		manifest.Kind = KindService
	default:
		manifest.Kind = KindAdapter
	}
	manifest.Implements = stringList(raw["implements"])
	manifest.Capabilities = flattenCapabilities(raw["capabilities"])
	manifest.ConfigSchema = normalizeConfigSchema(raw["configSchema"])
	manifest.Requires, manifest.Optional = normalizeRequirements(manifest.Kind, raw)
	if err := manifest.Validate(); err != nil {
		return EntityManifest{}, err
	}
	return manifest, nil
}

func normalizeRequirements(kind EntityKind, raw map[string]any) ([]Requirement, []Requirement) {
	if kind == KindPlugin || kind == KindService {
		platform, _ := raw["platform"].(map[string]any)
		return requirementList(platform["requires"]), requirementList(platform["optional"])
	}
	requires, _ := raw["requires"].(map[string]any)
	return requirementList(requires["adapters"]), nil
}

func requirementList(value any) []Requirement {
	result := []Requirement{}
	switch typed := value.(type) {
	case string:
		result = append(result, Requirement{Capability: typed})
	case []any:
		for _, item := range typed {
			switch item := item.(type) {
			case string:
				result = append(result, Requirement{Capability: item})
			case map[string]any:
				if id := stringValue(item["id"]); id != "" {
					result = append(result, Requirement{Capability: id})
				}
			}
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Capability < result[j].Capability })
	return result
}

func normalizeConfigSchema(value any) map[string]ConfigField {
	result := map[string]ConfigField{}
	entries, _ := value.(map[string]any)
	for name, raw := range entries {
		field, _ := raw.(map[string]any)
		config := ConfigField{Type: stringValue(field["type"]), Description: stringValue(field["description"])}
		if defaultValue, ok := field["default"]; ok {
			config.Default, _ = json.Marshal(defaultValue)
		}
		result[name] = config
	}
	return result
}

func flattenCapabilities(value any) []string {
	result := []string{}
	capabilities, _ := value.(map[string]any)
	for key, value := range capabilities {
		if key == "custom" {
			custom, _ := value.(map[string]any)
			for feature, enabled := range custom {
				if enabled == true {
					result = append(result, feature)
				}
			}
		} else if value == true {
			result = append(result, key)
		}
	}
	sort.Strings(result)
	return result
}

func stringList(value any) []string {
	if single, ok := value.(string); ok {
		return []string{single}
	}
	items, _ := value.([]any)
	result := make([]string, 0, len(items))
	for _, item := range items {
		if text := stringValue(item); text != "" {
			result = append(result, text)
		}
	}
	sort.Strings(result)
	return result
}

func stringValue(value any) string { text, _ := value.(string); return text }
