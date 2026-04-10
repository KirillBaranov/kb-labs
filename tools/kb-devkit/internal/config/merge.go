package config

import "fmt"

// ResolvePreset resolves a preset by name, following extends: chains with DFS.
// cfg.Presets is the single source of truth after config/pack loading.
// Returns error on cycles or unknown preset names.
func ResolvePreset(name string, cfg *DevkitConfig) (Preset, error) {
	visited := make(map[string]bool)
	return resolvePreset(name, cfg, visited)
}

func resolvePreset(name string, cfg *DevkitConfig, visited map[string]bool) (Preset, error) {
	if visited[name] {
		return Preset{}, fmt.Errorf("preset cycle detected at %q", name)
	}
	visited[name] = true

	var current Preset
	if cfg.Presets != nil {
		if p, ok := cfg.Presets[name]; ok {
			current = p
		} else if p, ok := GetDefaultPreset(name); ok {
			current = p
		} else {
			return Preset{}, fmt.Errorf("unknown preset %q", name)
		}
	} else if p, ok := GetDefaultPreset(name); ok {
		current = p
	} else {
		return Preset{}, fmt.Errorf("unknown preset %q", name)
	}

	if current.Extends == "" {
		return current, nil
	}

	base, err := resolvePreset(current.Extends, cfg, visited)
	if err != nil {
		return Preset{}, err
	}

	return mergePresets(base, current), nil
}

// mergePresets overlays child on top of base (child fields win).
func mergePresets(base, child Preset) Preset {
	result := base

	if child.Language != "" {
		result.Language = child.Language
	}

	// PackageJSON — merge slice/map fields; child wins on scalars.
	if len(child.PackageJSON.RequiredScripts) > 0 {
		result.PackageJSON.RequiredScripts = child.PackageJSON.RequiredScripts
	}
	if len(child.PackageJSON.RequiredDevDeps) > 0 {
		merged := make(map[string]string)
		for k, v := range base.PackageJSON.RequiredDevDeps {
			merged[k] = v
		}
		for k, v := range child.PackageJSON.RequiredDevDeps {
			merged[k] = v
		}
		result.PackageJSON.RequiredDevDeps = merged
	}
	if len(child.PackageJSON.RequiredFields) > 0 {
		result.PackageJSON.RequiredFields = child.PackageJSON.RequiredFields
	}
	if child.PackageJSON.Type != "" {
		result.PackageJSON.Type = child.PackageJSON.Type
	}
	if len(child.PackageJSON.Engines) > 0 {
		result.PackageJSON.Engines = child.PackageJSON.Engines
	}

	// TSConfig
	if child.TSConfig.MustExtendPattern != "" {
		result.TSConfig.MustExtendPattern = child.TSConfig.MustExtendPattern
	}
	if child.TSConfig.ForbidPaths {
		result.TSConfig.ForbidPaths = true
	}

	// TSup
	if child.TSup.MustUsePreset {
		result.TSup.MustUsePreset = true
	}
	if child.TSup.DTSRequired {
		result.TSup.DTSRequired = true
	}
	if child.TSup.TSConfigMustBeBuild {
		result.TSup.TSConfigMustBeBuild = true
	}
	if child.TSup.PresetPattern != "" {
		result.TSup.PresetPattern = child.TSup.PresetPattern
	}
	if child.TSup.MustImportPattern != "" {
		result.TSup.MustImportPattern = child.TSup.MustImportPattern
	}

	// ESLint
	if child.ESLint.MustUsePreset {
		result.ESLint.MustUsePreset = true
	}
	if child.ESLint.MustImportPattern != "" {
		result.ESLint.MustImportPattern = child.ESLint.MustImportPattern
	}

	// Structure
	if len(child.Structure.RequiredFiles) > 0 {
		result.Structure.RequiredFiles = child.Structure.RequiredFiles
	}

	// Deps — child wins on booleans only if explicitly set in child.
	// (Go zero value means "not set"; we treat true as intentional override.)
	if child.Deps.CheckLinks {
		result.Deps.CheckLinks = true
	}
	if child.Deps.CheckCircular {
		result.Deps.CheckCircular = true
	}
	if child.Deps.CheckVersionConsistency {
		result.Deps.CheckVersionConsistency = true
	}

	// Go
	if child.Go.MinVersion != "" {
		result.Go.MinVersion = child.Go.MinVersion
	}

	return result
}
