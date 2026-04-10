package cmd

import (
	"fmt"
	"os"

	"github.com/kb-labs/devkit/internal/checks"
	"github.com/kb-labs/devkit/internal/config"
	"github.com/spf13/cobra"
)

var (
	checkPackage string
	checkOnly    []string
)

var checkCmd = &cobra.Command{
	Use:   "check",
	Short: "Check workspace packages against devkit rules",
	Long: `Runs all configured rules against packages in the workspace.

Checks include: package_json, tsconfig, tsup, eslint, structure, deps, circular.

Use --only to run a subset of checks.
Use --package to check a single package.`,
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		ws, cfg, err := loadWorkspace()
		if err != nil {
			return err
		}

		pkgs := ws.Packages
		if checkPackage != "" {
			pkgs = ws.FilterByName([]string{checkPackage})
			if len(pkgs) == 0 {
				return fmt.Errorf("package %q not found in workspace", checkPackage)
			}
		}

		registry := checks.Build(cfg, ws.Root, "check")
		results := checks.RunAll(ws, cfg, registry, checkOnly)

		if jsonMode {
			return outputCheckJSON(results, cfg)
		}

		return outputCheckHuman(results, cfg)
	},
}

func init() {
	checkCmd.Flags().StringVar(&checkPackage, "package", "", "check a single package by name")
	checkCmd.Flags().StringSliceVar(&checkOnly, "only", nil, "run only specific checks (comma-separated)")
	rootCmd.AddCommand(checkCmd)
}

// ─── JSON output ─────────────────────────────────────────────────────────────

type checkJSONResult struct {
	OK           bool                         `json:"ok"`
	Packages     map[string]packageJSONResult `json:"packages"`
	Results      []checkJSONPackage           `json:"results"`
	Groups       map[string]int               `json:"groups,omitempty"`
	Capabilities map[string]int               `json:"capabilities,omitempty"`
	Summary      checkSummary                 `json:"summary"`
	Hint         string                       `json:"hint,omitempty"`
}

type packageJSONResult struct {
	OK     bool           `json:"ok"`
	Issues []checks.Issue `json:"issues"`
}

type checkJSONPackage struct {
	Package string         `json:"package"`
	OK      bool           `json:"ok"`
	Issues  []checks.Issue `json:"issues"`
}

type checkSummary struct {
	Total    int `json:"total"`
	Passed   int `json:"passed"`
	Failed   int `json:"failed"`
	Errors   int `json:"errors"`
	Warnings int `json:"warnings"`
}

func outputCheckJSON(results map[string]checks.PackageResult, cfg *config.DevkitConfig) error {
	out := checkJSONResult{
		OK:           true,
		Packages:     make(map[string]packageJSONResult, len(results)),
		Groups:       map[string]int{},
		Capabilities: map[string]int{},
	}

	for name, r := range results {
		hasErrors := false
		for _, issue := range r.Issues {
			if issue.Severity == checks.SeverityError {
				hasErrors = true
				out.Summary.Errors++
			} else if issue.Severity == checks.SeverityWarning {
				out.Summary.Warnings++
			}
		}

		ok := !hasErrors
		if !ok {
			out.OK = false
		}
		out.Packages[name] = packageJSONResult{
			OK:     ok,
			Issues: r.Issues,
		}
		out.Results = append(out.Results, checkJSONPackage{
			Package: name,
			OK:      ok,
			Issues:  r.Issues,
		})
		out.Groups[r.Package.Category]++
		for _, issue := range r.Issues {
			cap := string(issue.Capability)
			if cap == "" {
				cap = string(checks.CapabilityManual)
			}
			out.Capabilities[cap]++
		}

		out.Summary.Total++
		if ok {
			out.Summary.Passed++
		} else {
			out.Summary.Failed++
		}
	}

	if !out.OK {
		out.Hint = "run 'kb-devkit fix' to auto-fix issues where possible"
	}

	_ = JSONOut(out)
	if !out.OK {
		return errSilent
	}
	return nil
}

// ─── Human output ─────────────────────────────────────────────────────────────

func outputCheckHuman(results map[string]checks.PackageResult, cfg *config.DevkitConfig) error {
	o := newOutput()

	totalErrors := 0
	totalWarnings := 0
	totalPassed := 0

	for _, r := range results {
		if r.Skipped {
			continue
		}

		errCount := 0
		warnCount := 0
		for _, issue := range r.Issues {
			if issue.Severity == checks.SeverityError {
				errCount++
			} else {
				warnCount++
			}
		}
		totalErrors += errCount
		totalWarnings += warnCount

		if errCount == 0 && warnCount == 0 {
			totalPassed++
			continue
		}

		state := "warning"
		if errCount > 0 {
			state = "error"
		}

		fmt.Printf("\n%s %s\n", o.StatusIcon(state), o.label.Render(r.Package.Name))
		fmt.Printf("   %s\n", o.dim.Render(r.Package.RelPath))

		for _, issue := range r.Issues {
			prefix := o.SeverityColor(string(issue.Severity))
			msg := issue.Message
			if issue.File != "" {
				msg += o.dim.Render(" — " + issue.File)
			}
			fmt.Printf("   %s  %s\n", prefix, msg)
			if issue.Fix != "" {
				fmt.Printf("          %s\n", o.dim.Render("fix: "+issue.Fix))
			}
		}
	}

	fmt.Println()
	if totalErrors == 0 && totalWarnings == 0 {
		o.OK(fmt.Sprintf("All %d packages passed", totalPassed))
		return nil
	}

	o.Err(fmt.Sprintf("%d error(s), %d warning(s) across %d packages", totalErrors, totalWarnings, len(results)-totalPassed))
	os.Exit(1)
	return nil
}
