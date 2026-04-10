package checks

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kb-labs/devkit/internal/config"
	"github.com/kb-labs/devkit/internal/workspace"
)

func TestPackageJSONRuleReportsMissingFieldsAndVersionMismatch(t *testing.T) {
	pkg := tempPackage(t, `{
	  "name": "@kb/app",
	  "type": "commonjs",
	  "scripts": {"build": "tsup"},
	  "devDependencies": {"typescript": "^6.0.0"},
	  "engines": {"node": ">=20"}
	}`)
	preset := config.Preset{
		PackageJSON: config.PackageJSONRules{
			RequiredFields:  []string{"name", "version", "type"},
			RequiredScripts: []string{"build", "test"},
			RequiredDevDeps: map[string]string{"typescript": "^5.0.0", "vitest": "^3.0.0"},
			Type:            "module",
			Engines:         map[string]string{"node": ">=20", "pnpm": ">=9"},
		},
	}

	issues := (&PackageJSONRule{}).Check(pkg, preset)
	if len(issues) < 5 {
		t.Fatalf("issues = %#v, want multiple package_json failures", issues)
	}
}

func TestTSConfigRuleHandlesJSONCAndForbiddenPaths(t *testing.T) {
	pkg := tempPackage(t, `{}`)
	content := `{
	  // comment
	  "extends": "./base.json",
	  "compilerOptions": {
	    "paths": {
	      "@x/*": ["src/*"],
	    },
	  },
	}`
	writePkgFile(t, pkg.Dir, "tsconfig.json", content)

	preset := config.Preset{
		TSConfig: config.TSConfigRules{
			MustExtendPattern: "@kb-labs/devkit/tsconfig/",
			ForbidPaths:       true,
		},
	}

	issues := (&TSConfigRule{}).Check(pkg, preset)
	if len(issues) != 2 {
		t.Fatalf("issues = %#v, want extends + paths errors", issues)
	}

	cleaned := string(stripTSConfigComments([]byte(content)))
	if strings.Contains(cleaned, "//") || strings.Contains(cleaned, ",\n  }") {
		t.Fatalf("stripTSConfigComments did not normalize JSONC: %q", cleaned)
	}
}

func TestTSupRuleAndStructureRuleReportExpectedIssues(t *testing.T) {
	pkg := tempPackage(t, `{}`)
	writePkgFile(t, pkg.Dir, "tsup.config.ts", `
	  export default {
	    dts: false,
	  }
	`)

	tsupIssues := (&TSupRule{}).Check(pkg, config.Preset{
		TSup: config.TSupRules{
			MustUsePreset:       true,
			DTSRequired:         true,
			TSConfigMustBeBuild: true,
			PresetPattern:       "binPreset",
		},
	})
	if len(tsupIssues) != 3 {
		t.Fatalf("tsup issues = %#v, want 3", tsupIssues)
	}

	structureIssues := (&StructureRule{}).Check(pkg, config.Preset{
		Structure: config.StructureRules{RequiredFiles: []string{"README.md", "src/index.ts"}},
	})
	if len(structureIssues) != 2 {
		t.Fatalf("structure issues = %#v, want 2", structureIssues)
	}
}

func TestDepsRuleValidatesBrokenAndMismatchedLinkDeps(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "linked")
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatalf("mkdir target: %v", err)
	}
	if err := os.WriteFile(filepath.Join(target, "package.json"), []byte(`{"name":"@kb/other"}`), 0o644); err != nil {
		t.Fatalf("write target package.json: %v", err)
	}

	pkgDir := filepath.Join(root, "pkg")
	if err := os.MkdirAll(pkgDir, 0o755); err != nil {
		t.Fatalf("mkdir pkgDir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(pkgDir, "package.json"), []byte(`{
	  "name": "@kb/app",
	  "dependencies": {
	    "@kb/missing": "link:../missing",
	    "@kb/dep": "link:../linked"
	  }
	}`), 0o644); err != nil {
		t.Fatalf("write package.json: %v", err)
	}

	pkg := workspace.Package{Name: "@kb/app", Dir: pkgDir}
	issues := (&DepsRule{}).Check(pkg, config.Preset{
		Deps: config.DepsRules{CheckLinks: true},
	})
	if len(issues) != 2 {
		t.Fatalf("deps issues = %#v, want missing target + mismatched name", issues)
	}
}

func tempPackage(t *testing.T, pkgJSON string) workspace.Package {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(pkgJSON), 0o644); err != nil {
		t.Fatalf("write package.json: %v", err)
	}
	return workspace.Package{Name: "@kb/test", Dir: dir}
}

func writePkgFile(t *testing.T, dir, rel, content string) {
	t.Helper()
	path := filepath.Join(dir, rel)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", path, err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
