package config

import (
	"testing"

	"gopkg.in/yaml.v3"
)

func TestYAMLOrderedCategoriesAndTaskVariants(t *testing.T) {
	raw := []byte(`
schemaVersion: 2
workspace:
  packageManager: pnpm
  categories:
    tools:
      match: ["infra/*"]
      preset: go-binary
    libs:
      match: ["packages/*"]
      preset: node-lib
tasks:
  build:
    command: pnpm build
    inputs: ["src/**"]
  test:
    - categories: ["libs"]
      command: pnpm test
    - categories: ["tools"]
      command: go test ./...
`)

	var cfg yamlConfig
	if err := yaml.Unmarshal(raw, &cfg); err != nil {
		t.Fatalf("yaml.Unmarshal error: %v", err)
	}

	if len(cfg.Workspace.Categories) != 2 || cfg.Workspace.Categories[0].Name != "tools" || cfg.Workspace.Categories[1].Name != "libs" {
		t.Fatalf("ordered categories = %#v", cfg.Workspace.Categories)
	}

	if len(cfg.Tasks["build"]) != 1 || cfg.Tasks["build"][0].Command != "pnpm build" {
		t.Fatalf("single build task variant = %#v", cfg.Tasks["build"])
	}
	if len(cfg.Tasks["test"]) != 2 || cfg.Tasks["test"][1].Command != "go test ./..." {
		t.Fatalf("list task variants = %#v", cfg.Tasks["test"])
	}
}

func TestYAMLUnmarshalErrorsAndMapping(t *testing.T) {
	var cats yamlOrderedCategories
	if err := yaml.Unmarshal([]byte(`[]`), &cats); err == nil {
		t.Fatal("yamlOrderedCategories error = nil, want error")
	}

	raw := yamlConfig{
		Version: 2,
		Workspace: yamlWorkspace{
			PackageManager: "pnpm",
			MaxDepth:       4,
			Categories: yamlOrderedCategories{
				{Name: "libs", Category: CategoryConfig{Match: []string{"packages/*"}, Preset: "node-lib"}},
			},
		},
		Run:      yamlRun{Concurrency: 3},
		Affected: yamlAffected{Strategy: "command", Command: "./changed.sh"},
		Sync: yamlSync{
			Sources: map[string]yamlSyncSource{
				"templates": {Type: "local", Path: "./templates"},
			},
			Targets: []yamlSyncTarget{
				{Source: "templates", From: "base", To: ".config"},
			},
			Exclude: []string{"**/*.log"},
		},
		Tasks: map[string]yamlTask{
			"build": {
				{Command: "pnpm build", Inputs: []string{"src/**"}, Outputs: []string{"dist/**"}, Deps: []string{"^build"}},
			},
		},
		Presets: map[string]yamlPreset{
			"custom": {
				Extends:  "node-lib",
				Language: "typescript",
				PackageJSON: yamlPackageJSON{
					RequiredScripts: []string{"build"},
				},
				TSConfig: yamlTSConfig{
					MustExtendPattern: "@kb-labs/devkit/tsconfig/",
				},
				TSup: yamlTSup{
					MustUsePreset: true,
				},
				ESLint: yamlESLint{
					MustUsePreset: true,
				},
				Structure: yamlStructure{
					RequiredFiles: []string{"README.md"},
				},
				Deps: yamlDeps{
					CheckLinks: true,
				},
				Go: yamlGo{
					MinVersion: "1.22",
				},
			},
		},
		Custom: []yamlCustomCheck{
			{Name: "lint", Run: "pnpm lint", On: []string{"check"}, Language: "typescript"},
		},
	}

	cfg := mapYAML(raw)
	if cfg.Version != 2 || cfg.Run.Concurrency != 3 || cfg.Affected.Command != "./changed.sh" {
		t.Fatalf("mapped config basics = %+v", cfg)
	}
	if len(cfg.Workspace.Categories) != 1 || cfg.Workspace.Categories[0].Name != "libs" {
		t.Fatalf("mapped categories = %#v", cfg.Workspace.Categories)
	}
	if len(cfg.Sync.Targets) != 1 || cfg.Sync.Targets[0].To != ".config" {
		t.Fatalf("mapped sync = %+v", cfg.Sync)
	}
	if len(cfg.Tasks["build"]) != 1 || cfg.Tasks["build"][0].Command != "pnpm build" {
		t.Fatalf("mapped tasks = %#v", cfg.Tasks["build"])
	}
	if len(cfg.Custom) != 1 || cfg.Custom[0].Name != "lint" {
		t.Fatalf("mapped custom checks = %#v", cfg.Custom)
	}

	preset := mapPreset(raw.Presets["custom"])
	if !preset.TSup.MustUsePreset || !preset.ESLint.MustUsePreset || preset.Go.MinVersion != "1.22" {
		t.Fatalf("mapPreset = %+v", preset)
	}
}

func TestPresetConfigAndYamlTaskObjectFallback(t *testing.T) {
	cfg := &DevkitConfig{
		Presets: map[string]Preset{
			"custom": {Extends: "node-lib"},
		},
	}
	cat := CategoryConfig{Preset: "custom"}
	preset, err := cat.PresetConfig(cfg)
	if err != nil {
		t.Fatalf("PresetConfig error: %v", err)
	}
	if preset.Language != "typescript" {
		t.Fatalf("PresetConfig preset = %+v", preset)
	}

	var task yamlTask
	if err := yaml.Unmarshal([]byte("command: pnpm build\ninputs: [src/**]\n"), &task); err != nil {
		t.Fatalf("yamlTask single object unmarshal error: %v", err)
	}
	if len(task) != 1 || task[0].Command != "pnpm build" {
		t.Fatalf("yamlTask single object = %#v", task)
	}
}
