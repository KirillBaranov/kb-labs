package checks

import (
	"os"
	"path/filepath"
	"regexp"

	"github.com/kb-labs/devkit/internal/config"
	"github.com/kb-labs/devkit/internal/workspace"
)

// ESLintRule checks that eslint.config.js uses the devkit preset.
type ESLintRule struct{}

func (r *ESLintRule) Name() string { return "eslint" }

func (r *ESLintRule) Check(pkg workspace.Package, preset config.Preset) []Issue {
	if !preset.ESLint.MustUsePreset && preset.ESLint.MustImportPattern == "" {
		return nil
	}

	candidates := []string{"eslint.config.js", "eslint.config.mjs", "eslint.config.ts", ".eslintrc.js", ".eslintrc.json"}
	var content []byte
	var configPath string

	for _, name := range candidates {
		p := filepath.Join(pkg.Dir, name)
		data, err := os.ReadFile(p)
		if err == nil {
			content = data
			configPath = p
			break
		}
	}

	if content == nil {
		return []Issue{{
			Check:    r.Name(),
			Severity: SeverityError,
			Message:  "no eslint config found",
			File:     filepath.Join(pkg.Dir, "eslint.config.js"),
			Fix:      "create eslint.config.js using the configured preset",
		}}
	}

	pattern := preset.ESLint.MustImportPattern
	if pattern == "" {
		pattern = "@kb-labs/devkit"
	}
	if !regexp.MustCompile(regexp.QuoteMeta(pattern)).Match(content) {
		return []Issue{{
			Check:    r.Name(),
			Severity: SeverityError,
			Message:  "eslint config does not import the expected preset",
			File:     configPath,
			Fix:      "import and use the configured eslint preset",
		}}
	}

	return nil
}
