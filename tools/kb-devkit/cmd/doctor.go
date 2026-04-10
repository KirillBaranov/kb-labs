package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

var doctorCmd = &cobra.Command{
	Use:   "doctor",
	Short: "Environment diagnostics",
	Long:  `Checks that the local environment is healthy: node, pnpm, submodules, devkit.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		checks := runDoctorChecks()

		if jsonMode {
			ok := true
			for _, c := range checks {
				if !c.OK {
					ok = false
					break
				}
			}
			hint := ""
			for _, c := range checks {
				if !c.OK && c.Fix != "" {
					hint = c.Fix
					break
				}
			}
			_ = JSONOut(map[string]any{
				"ok":     ok,
				"checks": checks,
				"hint":   hint,
			})
			if !ok {
				return errSilent
			}
			return nil
		}

		o := newOutput()
		fmt.Printf("\n%s\n\n", o.label.Render("Environment Diagnostics"))

		allOK := true
		for _, c := range checks {
			icon := o.StatusIcon("healthy")
			detail := c.Detail
			if !c.OK {
				icon = o.StatusIcon("error")
				detail = o.errStyle.Render(c.Detail)
				allOK = false
			}
			fmt.Printf("  %s %-30s %s\n", icon, c.Name, detail)
			if !c.OK && c.Fix != "" {
				fmt.Printf("       %s\n", o.dim.Render("fix: "+c.Fix))
			}
		}

		fmt.Println()
		if allOK {
			o.OK("Environment is healthy")
		} else {
			o.Err("Environment has issues — see above")
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(doctorCmd)
}

type doctorCheck struct {
	Name   string `json:"name"`
	OK     bool   `json:"ok"`
	Detail string `json:"detail"`
	Fix    string `json:"fix,omitempty"`
}

func runDoctorChecks() []doctorCheck {
	var results []doctorCheck

	// Node.js version.
	results = append(results, checkCommand("node", "--version", "node.js"))

	// pnpm version.
	results = append(results, checkCommand("pnpm", "--version", "pnpm"))

	// git.
	results = append(results, checkCommand("git", "--version", "git"))

	// devkit.yaml exists.
	cwd, _ := os.Getwd()
	cfgOK := false
	cfgDetail := "not found"
	for _, name := range []string{"devkit.yaml", "devkit.yml"} {
		if _, err := os.Stat(filepath.Join(cwd, name)); err == nil {
			cfgOK = true
			cfgDetail = name
			break
		}
	}
	results = append(results, doctorCheck{
		Name:   "devkit.yaml",
		OK:     cfgOK,
		Detail: cfgDetail,
		Fix:    "create devkit.yaml in workspace root",
	})

	// pnpm-workspace.yaml.
	wsOK := false
	wsDetail := "not found"
	for _, name := range []string{"pnpm-workspace.yaml", "pnpm-workspace.yml"} {
		if _, err := os.Stat(filepath.Join(cwd, name)); err == nil {
			wsOK = true
			wsDetail = name
			break
		}
	}
	results = append(results, doctorCheck{
		Name:   "pnpm-workspace.yaml",
		OK:     wsOK,
		Detail: wsDetail,
		Fix:    "create pnpm-workspace.yaml with packages: [...]",
	})

	return results
}

func checkCommand(name, arg, label string) doctorCheck {
	cmd := exec.Command(name, arg)
	out, err := cmd.Output()
	if err != nil {
		return doctorCheck{
			Name:   label,
			OK:     false,
			Detail: "not found",
			Fix:    fmt.Sprintf("install %s", name),
		}
	}
	version := strings.TrimSpace(string(out))
	return doctorCheck{
		Name:   label,
		OK:     true,
		Detail: version,
	}
}
