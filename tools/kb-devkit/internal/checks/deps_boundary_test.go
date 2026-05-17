package checks

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kb-labs/devkit/internal/config"
	"github.com/kb-labs/devkit/internal/workspace"
)

func newBoundaryPreset() config.Preset {
	return config.Preset{
		Deps: config.DepsRules{
			AllowedKbDeps: []string{
				"@kb-labs/sdk",
				"@kb-labs/sdk/*",
				"@kb-labs/devkit",
			},
			ForbiddenKbDeps: []string{
				"@kb-labs/core-*",
				"@kb-labs/adapters-*",
			},
		},
	}
}

func TestDepsRuleBoundary_ForbidsCorePlatformDependency(t *testing.T) {
	pkg := tempPackage(t, `{
	  "name": "@kb-labs/adapters-foo",
	  "devDependencies": {"@kb-labs/core-platform": "workspace:*"}
	}`)
	issues := (&DepsRule{}).Check(pkg, newBoundaryPreset())
	if len(issues) != 1 {
		t.Fatalf("issues = %d, want 1; got %#v", len(issues), issues)
	}
	if !strings.Contains(issues[0].Message, "@kb-labs/core-platform") {
		t.Fatalf("issue message = %q, want core-platform mention", issues[0].Message)
	}
}

func TestDepsRuleBoundary_AllowsSdkDependency(t *testing.T) {
	pkg := tempPackage(t, `{
	  "name": "@kb-labs/adapters-foo",
	  "devDependencies": {"@kb-labs/sdk": "workspace:*", "@kb-labs/devkit": "workspace:*"}
	}`)
	issues := (&DepsRule{}).Check(pkg, newBoundaryPreset())
	if len(issues) != 0 {
		t.Fatalf("issues = %#v, want none", issues)
	}
}

func TestDepsRuleBoundary_ForbidsSourceImport(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{
	  "name": "@kb-labs/adapters-foo",
	  "devDependencies": {"@kb-labs/sdk": "workspace:*"}
	}`), 0o644); err != nil {
		t.Fatalf("write pkg: %v", err)
	}
	srcDir := filepath.Join(dir, "src")
	if err := os.MkdirAll(srcDir, 0o755); err != nil {
		t.Fatalf("mkdir src: %v", err)
	}
	srcContent := `import { ILogger } from '@kb-labs/core-platform';
import { defineAdapterManifest } from '@kb-labs/sdk/adapters';
export const x = 1;
`
	if err := os.WriteFile(filepath.Join(srcDir, "index.ts"), []byte(srcContent), 0o644); err != nil {
		t.Fatalf("write src: %v", err)
	}
	pkg := workspace.Package{Name: "@kb-labs/adapters-foo", Dir: dir}
	issues := (&DepsRule{}).Check(pkg, newBoundaryPreset())
	if len(issues) != 1 {
		t.Fatalf("issues = %d, want 1; got %#v", len(issues), issues)
	}
	if !strings.Contains(issues[0].Message, "@kb-labs/core-platform") {
		t.Fatalf("issue = %q, want core-platform mention", issues[0].Message)
	}
}

func TestDepsRuleBoundary_AllowlistFlagsUnknownKbDep(t *testing.T) {
	pkg := tempPackage(t, `{
	  "name": "@kb-labs/adapters-foo",
	  "devDependencies": {"@kb-labs/shared-cli-ui": "workspace:*"}
	}`)
	issues := (&DepsRule{}).Check(pkg, newBoundaryPreset())
	if len(issues) != 1 {
		t.Fatalf("issues = %d, want 1; got %#v", len(issues), issues)
	}
	if !strings.Contains(issues[0].Message, "shared-cli-ui") {
		t.Fatalf("issue = %q, want shared-cli-ui mention", issues[0].Message)
	}
}

func TestDepsRuleBoundary_AllowsSelfAndNestedSdkPaths(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{
	  "name": "@kb-labs/adapters-foo",
	  "devDependencies": {"@kb-labs/sdk": "workspace:*"}
	}`), 0o644); err != nil {
		t.Fatalf("write pkg: %v", err)
	}
	srcDir := filepath.Join(dir, "src")
	if err := os.MkdirAll(srcDir, 0o755); err != nil {
		t.Fatalf("mkdir src: %v", err)
	}
	srcContent := `import { IPCTransport } from '@kb-labs/sdk/adapters/infra';
import { defineAdapterManifest } from '@kb-labs/sdk/adapters';
import { local } from '@kb-labs/adapters-foo/internal';
`
	if err := os.WriteFile(filepath.Join(srcDir, "index.ts"), []byte(srcContent), 0o644); err != nil {
		t.Fatalf("write src: %v", err)
	}
	pkg := workspace.Package{Name: "@kb-labs/adapters-foo", Dir: dir}
	issues := (&DepsRule{}).Check(pkg, newBoundaryPreset())
	if len(issues) != 0 {
		t.Fatalf("issues = %#v, want none", issues)
	}
}

func TestMatchPatternHandlesGlobAndPrefix(t *testing.T) {
	cases := []struct {
		s, pattern string
		want       bool
	}{
		{"@kb-labs/core-platform", "@kb-labs/core-*", true},
		{"@kb-labs/core-runtime", "@kb-labs/core-*", true},
		{"@kb-labs/sdk", "@kb-labs/sdk", true},
		{"@kb-labs/sdk/adapters", "@kb-labs/sdk", true},
		{"@kb-labs/sdk/adapters/infra", "@kb-labs/sdk/*", true},
		{"@kb-labs/sdk", "@kb-labs/sdk/*", true},
		{"@kb-labs/shared-cli", "@kb-labs/core-*", false},
		{"@kb-labs/adapters-x", "@kb-labs/sdk", false},
	}
	for _, c := range cases {
		got := matchPattern(c.s, c.pattern)
		if got != c.want {
			t.Errorf("matchPattern(%q, %q) = %v, want %v", c.s, c.pattern, got, c.want)
		}
	}
}
