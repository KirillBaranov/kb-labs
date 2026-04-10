package checks

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/kb-labs/devkit/internal/config"
	"github.com/kb-labs/devkit/internal/workspace"
)

type fakeRule struct {
	name   string
	issues []Issue
}

func (r fakeRule) Name() string { return r.name }

func (r fakeRule) Check(pkg workspace.Package, preset config.Preset) []Issue {
	out := make([]Issue, len(r.issues))
	copy(out, r.issues)
	for i := range out {
		if out[i].Message == "" {
			out[i].Message = pkg.Name
		}
	}
	return out
}

func TestRunAllAppliesOnlyFilterAndMergesCircularResults(t *testing.T) {
	root := t.TempDir()
	pkgA := workspace.Package{
		Name:     "@kb/a",
		Dir:      filepath.Join(root, "packages", "a"),
		Preset:   "node-lib",
		Language: "typescript",
	}
	pkgB := workspace.Package{
		Name:     "@kb/b",
		Dir:      filepath.Join(root, "packages", "b"),
		Preset:   "node-lib",
		Language: "typescript",
	}

	writePackageJSON(t, pkgA.Dir, `{"name":"@kb/a","dependencies":{"@kb/b":"workspace:*"}}`)
	writePackageJSON(t, pkgB.Dir, `{"name":"@kb/b","dependencies":{"@kb/a":"workspace:*"}}`)

	ws := &workspace.Workspace{Packages: []workspace.Package{pkgA, pkgB}}
	cfg := &config.DevkitConfig{
		Workspace: config.WorkspaceConfig{
			Categories: []config.NamedCategory{
				{Name: "libs", Category: config.CategoryConfig{Preset: "node-lib"}},
			},
		},
	}
	registry := &Registry{
		rules: []Rule{
			fakeRule{name: "selected", issues: []Issue{{Check: "selected", Severity: SeverityInfo}}},
			fakeRule{name: "ignored", issues: []Issue{{Check: "ignored", Severity: SeverityWarning}}},
		},
	}

	results := RunAll(ws, cfg, registry, []string{"selected", "circular"})

	for _, pkg := range []workspace.Package{pkgA, pkgB} {
		result, ok := results[pkg.Name]
		if !ok {
			t.Fatalf("missing result for %s", pkg.Name)
		}
		if result.Skipped {
			t.Fatalf("package %s unexpectedly skipped", pkg.Name)
		}
		if len(result.Issues) != 2 {
			t.Fatalf("issues for %s = %#v, want selected + circular", pkg.Name, result.Issues)
		}
		if result.Issues[0].Check != "selected" || result.Issues[1].Check != "circular" {
			t.Fatalf("unexpected issues for %s: %#v", pkg.Name, result.Issues)
		}
	}
}

func TestRunAllSkipsPackageWhenPresetResolutionFails(t *testing.T) {
	ws := &workspace.Workspace{
		Packages: []workspace.Package{
			{Name: "@kb/missing", Dir: t.TempDir(), Preset: "does-not-exist"},
		},
	}
	cfg := &config.DevkitConfig{
		Workspace: config.WorkspaceConfig{
			Categories: []config.NamedCategory{
				{Name: "libs", Category: config.CategoryConfig{Preset: "node-lib"}},
			},
		},
	}

	results := RunAll(ws, cfg, &Registry{}, nil)
	result := results["@kb/missing"]
	if !result.Skipped {
		t.Fatalf("Skipped = false, want true: %#v", result)
	}
}

func writePackageJSON(t *testing.T, dir, content string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", dir, err)
	}
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(content), 0o644); err != nil {
		t.Fatalf("write package.json: %v", err)
	}
}
