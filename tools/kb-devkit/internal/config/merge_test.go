package config

import (
	"strings"
	"testing"
)

func TestResolvePresetMergesBuiltInAndUserPreset(t *testing.T) {
	cfg := &DevkitConfig{
		Presets: map[string]Preset{
			"custom-cli": {
				Extends:  "node-cli",
				Language: "typescript",
				PackageJSON: PackageJSONRules{
					RequiredDevDeps: map[string]string{
						"tsx": "^4.0.0",
					},
				},
				Structure: StructureRules{
					RequiredFiles: []string{"src/index.ts", "README.md", "bin/devkit.ts"},
				},
			},
		},
	}

	got, err := ResolvePreset("custom-cli", cfg)
	if err != nil {
		t.Fatalf("ResolvePreset error: %v", err)
	}

	if got.Language != "typescript" {
		t.Fatalf("Language = %q, want typescript", got.Language)
	}
	if got.PackageJSON.RequiredDevDeps["tsx"] != "^4.0.0" {
		t.Fatalf("tsx version = %q, want ^4.0.0", got.PackageJSON.RequiredDevDeps["tsx"])
	}
	if got.PackageJSON.RequiredDevDeps["typescript"] != "^5" {
		t.Fatalf("typescript version = %q, want inherited generic default", got.PackageJSON.RequiredDevDeps["typescript"])
	}
	if len(got.Structure.RequiredFiles) != 3 {
		t.Fatalf("RequiredFiles = %#v, want child override", got.Structure.RequiredFiles)
	}
}

func TestResolvePresetDetectsCyclesAndUnknownPresets(t *testing.T) {
	cfg := &DevkitConfig{
		Presets: map[string]Preset{
			"a": {Extends: "b"},
			"b": {Extends: "a"},
		},
	}

	if _, err := ResolvePreset("a", cfg); err == nil || !strings.Contains(err.Error(), "cycle") {
		t.Fatalf("ResolvePreset cycle error = %v, want cycle error", err)
	}

	if _, err := ResolvePreset("missing", &DevkitConfig{}); err == nil || !strings.Contains(err.Error(), "unknown preset") {
		t.Fatalf("ResolvePreset unknown error = %v, want unknown preset error", err)
	}
}
