package checks

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/kb-labs/devkit/internal/config"
	"github.com/kb-labs/devkit/internal/workspace"
)

// StructureRule checks that required files exist in the package directory.
type StructureRule struct{}

func (r *StructureRule) Name() string { return "structure" }

func (r *StructureRule) Check(pkg workspace.Package, preset config.Preset) []Issue {
	if len(preset.Structure.RequiredFiles) == 0 {
		return nil
	}

	var issues []Issue
	for _, relFile := range preset.Structure.RequiredFiles {
		full := filepath.Join(pkg.Dir, relFile)
		if _, err := os.Stat(full); os.IsNotExist(err) {
			issues = append(issues, Issue{
				Check:      r.Name(),
				Severity:   SeverityError,
				Message:    fmt.Sprintf("required file %q not found", relFile),
				File:       full,
				Fix:        fmt.Sprintf("create %s", relFile),
				Capability: CapabilityScaffoldable,
			})
		}
	}

	return issues
}

func (r *StructureRule) Apply(pkg workspace.Package, issues []Issue, dryRun bool) error {
	for _, issue := range issues {
		if issue.Capability != CapabilityScaffoldable {
			continue
		}
		if dryRun {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(issue.File), 0o755); err != nil {
			return err
		}
		if _, err := os.Stat(issue.File); err == nil {
			continue
		}
		content := []byte(defaultFileContent(issue.File))
		if err := os.WriteFile(issue.File, content, 0o644); err != nil {
			return err
		}
	}
	return nil
}

func defaultFileContent(path string) string {
	base := filepath.Base(path)
	switch {
	case strings.EqualFold(base, "README.md"):
		return "# TODO\n"
	case strings.HasSuffix(base, ".ts"), strings.HasSuffix(base, ".tsx"):
		return "export {};\n"
	default:
		return ""
	}
}
