package checks

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/kb-labs/devkit/internal/config"
	"github.com/kb-labs/devkit/internal/workspace"
)

func TestESLintRuleReportsMissingAndInvalidConfig(t *testing.T) {
	dir := t.TempDir()
	pkg := workspace.Package{Name: "@kb/pkg", Dir: dir}
	preset := config.Preset{
		ESLint: config.ESLintRules{MustUsePreset: true},
	}

	issues := (&ESLintRule{}).Check(pkg, preset)
	if len(issues) != 1 || issues[0].Message != "no eslint config found" {
		t.Fatalf("missing config issues = %#v", issues)
	}

	path := filepath.Join(dir, "eslint.config.js")
	if err := os.WriteFile(path, []byte("export default []"), 0o644); err != nil {
		t.Fatalf("write eslint config: %v", err)
	}

	issues = (&ESLintRule{}).Check(pkg, preset)
	if len(issues) != 1 || issues[0].File != path {
		t.Fatalf("invalid config issues = %#v", issues)
	}

	if err := os.WriteFile(path, []byte(`import preset from "@kb-labs/devkit/eslint"; export default [preset];`), 0o644); err != nil {
		t.Fatalf("write valid eslint config: %v", err)
	}
	issues = (&ESLintRule{}).Check(pkg, preset)
	if len(issues) != 0 {
		t.Fatalf("valid config issues = %#v, want none", issues)
	}
}
