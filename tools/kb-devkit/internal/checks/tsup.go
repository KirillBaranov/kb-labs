package checks

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"

	"github.com/kb-labs/devkit/internal/config"
	"github.com/kb-labs/devkit/internal/workspace"
)

var (
	reDTSFalse      = regexp.MustCompile(`dts\s*:\s*false`)
	reTSConfigBuild = regexp.MustCompile(`tsconfig\s*:\s*['"]tsconfig\.build\.json['"]`)
)

// TSupRule checks tsup.config.ts using regex (no AST needed for standardized configs).
type TSupRule struct{}

func (r *TSupRule) Name() string { return "tsup" }

func (r *TSupRule) Check(pkg workspace.Package, preset config.Preset) []Issue {
	rules := preset.TSup
	if !rules.MustUsePreset && !rules.DTSRequired && !rules.TSConfigMustBeBuild {
		return nil
	}

	candidates := []string{"tsup.config.ts", "tsup.config.js", "tsup.config.mjs"}
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
		if rules.MustUsePreset {
			return []Issue{{
				Check:    r.Name(),
				Severity: SeverityError,
				Message:  "tsup.config.ts not found",
				File:     filepath.Join(pkg.Dir, "tsup.config.ts"),
				Fix:      "create tsup.config.ts using the configured preset",
			}}
		}
		return nil
	}

	var issues []Issue

	// Must import expected preset/module.
	importPattern := rules.MustImportPattern
	if importPattern == "" && rules.MustUsePreset {
		importPattern = "@kb-labs/devkit/tsup"
	}
	if importPattern != "" && !regexp.MustCompile(regexp.QuoteMeta(importPattern)).Match(content) {
		patternStr := importPattern
		if rules.PresetPattern != "" {
			patternStr = rules.PresetPattern
		}
		issues = append(issues, Issue{
			Check:    r.Name(),
			Severity: SeverityError,
			Message:  fmt.Sprintf("tsup.config.ts does not import the expected preset/module (expected %s)", patternStr),
			File:     configPath,
			Fix:      "import and use the configured tsup preset",
		})
	}

	// dts: false is forbidden.
	if rules.DTSRequired && reDTSFalse.Match(content) {
		issues = append(issues, Issue{
			Check:      r.Name(),
			Severity:   SeverityError,
			Message:    "dts: false detected — type declarations must be generated",
			File:       configPath,
			Fix:        "remove dts: false or set dts: true",
			AutoFix:    true,
			Capability: CapabilityFixable,
		})
	}

	// tsconfig must reference tsconfig.build.json.
	if rules.TSConfigMustBeBuild && !reTSConfigBuild.Match(content) {
		issues = append(issues, Issue{
			Check:    r.Name(),
			Severity: SeverityWarning,
			Message:  `tsup.config.ts should reference tsconfig.build.json`,
			File:     configPath,
			Fix:      `set tsconfig: 'tsconfig.build.json' in tsup config`,
		})
	}

	return issues
}

func (r *TSupRule) Apply(pkg workspace.Package, issues []Issue, dryRun bool) error {
	candidates := []string{"tsup.config.ts", "tsup.config.js", "tsup.config.mjs"}
	for _, name := range candidates {
		path := filepath.Join(pkg.Dir, name)
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		updated := reDTSFalse.ReplaceAll(data, []byte("dts: true"))
		if dryRun || string(updated) == string(data) {
			return nil
		}
		return os.WriteFile(path, updated, 0o644)
	}
	return nil
}
