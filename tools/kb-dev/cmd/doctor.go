package cmd

import (
	"fmt"
	"os/exec"
	"strings"

	"github.com/kb-labs/dev/internal/docker"
	"github.com/kb-labs/dev/internal/environ"
	"github.com/kb-labs/dev/internal/manager"
	"github.com/kb-labs/dev/internal/process"
	"github.com/spf13/cobra"
)

var doctorCmd = &cobra.Command{
	Use:   "doctor",
	Short: "Check environment health and diagnose issues",
	Args:  cobra.NoArgs,
	RunE:  runDoctor,
}

func init() {
	rootCmd.AddCommand(doctorCmd)
}

func runDoctor(_ *cobra.Command, _ []string) error {
	result := &manager.DoctorResult{OK: true}

	// 1. Config.
	cfgPath, err := FindConfigPath()
	if err != nil {
		result.Checks = append(result.Checks, manager.DoctorCheck{
			ID: "config", OK: false, Detail: err.Error(),
		})
		result.OK = false
	} else {
		cfg, err := loadConfig(cfgPath)
		if err != nil {
			result.Checks = append(result.Checks, manager.DoctorCheck{
				ID: "config", OK: false, Detail: err.Error(), Path: cfgPath,
			})
			result.OK = false
		} else {
			result.Checks = append(result.Checks, manager.DoctorCheck{
				ID:     "config",
				OK:     true,
				Detail: fmt.Sprintf("%d services, %d groups", len(cfg.Services), len(cfg.Groups)),
				Path:   cfgPath,
			})

			// 5. Port conflicts.
			for id, svc := range cfg.Services {
				if svc.Port == 0 {
					continue
				}
				pids := process.GetListenerPIDs(svc.Port)
				if len(pids) > 0 {
					result.Checks = append(result.Checks, manager.DoctorCheck{
						ID:     fmt.Sprintf("port:%d", svc.Port),
						OK:     false,
						Detail: fmt.Sprintf("occupied (PID %d), needed by %s", pids[0], id),
					})
					result.OK = false
					if result.Hint == "" {
						result.Hint = fmt.Sprintf("Port %d occupied. Fix: kb-dev stop %s --force", svc.Port, id)
					}
				} else {
					result.Checks = append(result.Checks, manager.DoctorCheck{
						ID: fmt.Sprintf("port:%d", svc.Port), OK: true, Detail: "free",
					})
				}
			}
		}
	}

	// 2. Docker.
	if docker.Available() {
		v := docker.Version()
		result.Checks = append(result.Checks, manager.DoctorCheck{
			ID: "docker", OK: true, Detail: "Docker " + v,
		})
	} else {
		result.Checks = append(result.Checks, manager.DoctorCheck{
			ID: "docker", OK: false, Detail: "Docker not available",
		})
		result.OK = false
	}

	// 3. Node.
	env := environ.Resolve()
	if env.Node != "" {
		nodeVersion := getVersion(env.Node, "--version")
		result.Checks = append(result.Checks, manager.DoctorCheck{
			ID: "node", OK: true, Detail: nodeVersion, Path: env.Node,
		})
	} else {
		result.Checks = append(result.Checks, manager.DoctorCheck{
			ID: "node", OK: false, Detail: "node not found on PATH",
		})
		result.OK = false
	}

	// 4. pnpm.
	if env.Pnpm != "" {
		pnpmVersion := getVersion(env.Pnpm, "--version")
		result.Checks = append(result.Checks, manager.DoctorCheck{
			ID: "pnpm", OK: true, Detail: pnpmVersion, Path: env.Pnpm,
		})
	} else {
		result.Checks = append(result.Checks, manager.DoctorCheck{
			ID: "pnpm", OK: false, Detail: "pnpm not found on PATH",
		})
		result.OK = false
	}

	if jsonMode {
		return JSONOut(result)
	}

	out := newOutput()
	fmt.Println()
	fmt.Println(out.label.Render("Environment Check"))
	fmt.Println()

	for _, check := range result.Checks {
		icon := out.StatusIcon("alive")
		if !check.OK {
			icon = out.StatusIcon("failed")
		}
		detail := check.Detail
		if check.Path != "" {
			detail += " " + out.dim.Render("("+check.Path+")")
		}
		fmt.Printf("  %s %s  %s\n", icon, Pad(check.ID, 15), detail)
	}

	fmt.Println()
	if result.Hint != "" {
		out.Warn(result.Hint)
	}

	if !result.OK {
		return errSilent
	}
	return nil
}

func getVersion(binary, flag string) string {
	out, err := exec.Command(binary, flag).Output()
	if err != nil {
		return "unknown"
	}
	return strings.TrimSpace(string(out))
}
