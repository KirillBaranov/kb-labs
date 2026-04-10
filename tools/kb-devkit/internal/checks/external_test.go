package checks

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/kb-labs/devkit/internal/config"
	"github.com/kb-labs/devkit/internal/workspace"
)

func TestExternalCommandCheckAndFix(t *testing.T) {
	root := t.TempDir()
	pkgDir := filepath.Join(root, "packages", "demo")
	if err := os.MkdirAll(pkgDir, 0o755); err != nil {
		t.Fatalf("mkdir pkg: %v", err)
	}
	if err := os.WriteFile(filepath.Join(pkgDir, "package.json"), []byte(`{"name":"@acme/demo","version":"1.0.0"}`), 0o644); err != nil {
		t.Fatalf("write package.json: %v", err)
	}

	script := filepath.Join(root, "external-check.sh")
	if err := os.WriteFile(script, []byte(`#!/bin/sh
if [ "$KB_DEVKIT_MODE" = "fix" ]; then
  if [ "$KB_DEVKIT_DRY_RUN" != "true" ]; then
    echo "# demo" > "$KB_DEVKIT_PACKAGE_DIR/README.md"
  fi
  printf '{"actions":["created README.md"]}\n'
  exit 0
fi
if [ ! -f "$KB_DEVKIT_PACKAGE_DIR/README.md" ]; then
  printf '{"issues":[{"check":"external-readme","severity":"error","message":"README missing","file":"%s/README.md","fix":"create README.md","capability":"scaffoldable"}]}\n' "$KB_DEVKIT_PACKAGE_DIR"
else
  printf '{"issues":[]}\n'
fi
`), 0o755); err != nil {
		t.Fatalf("write script: %v", err)
	}

	cfg := &config.DevkitConfig{
		Presets: map[string]config.Preset{
			"ext-lib": {Language: "typescript"},
		},
		Checks: config.ChecksConfig{
			Packages: map[string]config.CheckPackConfig{
				"external-readme": {
					Enabled: true,
					Config:  map[string]any{"requiredFile": "README.md"},
				},
			},
		},
		Custom: []config.CustomCheck{{
			Name:     "external-readme",
			Run:      script,
			Fix:      script,
			On:       []string{"check"},
			Language: "typescript",
		}},
	}
	ws := &workspace.Workspace{
		Root: root,
		Packages: []workspace.Package{{
			Name:     "@acme/demo",
			Dir:      pkgDir,
			RelPath:  "packages/demo",
			Category: "ext-lib",
			Preset:   "ext-lib",
			Language: "typescript",
		}},
	}

	registry := Build(cfg, root, "check")
	results := RunAll(ws, cfg, registry, []string{"external-readme"})
	result := results["@acme/demo"]
	if len(result.Issues) != 1 || result.Issues[0].Check != "external-readme" {
		t.Fatalf("issues = %#v, want external-readme issue", result.Issues)
	}

	var fixer Fixer
	for _, rule := range registry.All() {
		if rule.Name() == "external-readme" {
			f, ok := rule.(Fixer)
			if !ok {
				t.Fatalf("external rule does not implement Fixer")
			}
			fixer = f
			break
		}
	}
	if fixer == nil {
		t.Fatal("external fixer not found in registry")
	}
	if err := fixer.Apply(result.Package, result.Issues, false); err != nil {
		t.Fatalf("Apply error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(pkgDir, "README.md")); err != nil {
		t.Fatalf("README.md not created: %v", err)
	}
}

func TestBuildSkipsDisabledOrMismatchedExternalChecks(t *testing.T) {
	cfg := &config.DevkitConfig{
		Checks: config.ChecksConfig{
			Packages: map[string]config.CheckPackConfig{
				"disabled": {Enabled: false},
			},
		},
		Custom: []config.CustomCheck{
			{Name: "disabled", Run: "true", On: []string{"check"}, Language: "typescript"},
			{Name: "go-only", Run: "true", On: []string{"check"}, Language: "go"},
		},
	}

	registry := Build(cfg, t.TempDir(), "check")
	rules := registry.RulesFor(config.Preset{Language: "typescript"})
	for _, rule := range rules {
		if rule.Name() == "disabled" || rule.Name() == "go-only" {
			t.Fatalf("unexpected external rule %q in typescript registry", rule.Name())
		}
	}
}
