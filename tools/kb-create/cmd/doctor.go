package cmd

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/kb-labs/create/internal/config"
	"github.com/kb-labs/create/internal/installer"
	"github.com/kb-labs/create/internal/logger"
	"github.com/kb-labs/create/internal/pm"
	"github.com/kb-labs/create/internal/telemetry"
)

type doctorCheck struct {
	Name    string
	OK      bool
	Soft    bool   // if true, failure is advisory (WARN, doesn't affect exit code)
	Details string
	Fix     func() error // nil = not auto-fixable
	FixHint string       // shown when Fix is nil but there's a manual action
}

var doctorFixFlag bool

var doctorCmd = &cobra.Command{
	Use:   "doctor",
	Short: "Run environment diagnostics",
	Long: `Checks local prerequisites and connectivity used by kb-create.
Use --fix to attempt automatic repair of failed checks.`,
	RunE: runDoctor,
}

func init() {
	rootCmd.AddCommand(doctorCmd)
	doctorCmd.Flags().BoolVar(&doctorFixFlag, "fix", false, "auto-repair failed checks")
}

func runDoctor(cmd *cobra.Command, args []string) error {
	out := newOutput()
	platformDir, _ := resolvePlatformDir(cmd)

	var tc *telemetry.Client
	if cfg, cfgErr := config.Read(platformDir); cfgErr == nil {
		tc = initTelemetry(rootCmd.Version, &cfg.Telemetry)
	} else {
		tc = telemetry.Nop()
	}
	defer tc.Flush()

	checks := buildChecks(platformDir)

	out.Section("Environment Doctor")
	printChecks(out, checks)

	failed := failedChecks(checks)

	tc.Track("doctor_run", map[string]string{
		"checks_total":  fmt.Sprintf("%d", len(checks)),
		"checks_failed": fmt.Sprintf("%d", len(failed)),
		"fix_mode":      fmt.Sprintf("%v", doctorFixFlag),
	})

	softFailed := softFailedChecks(checks)
	if len(failed) == 0 {
		fmt.Println()
		if len(softFailed) > 0 {
			out.OK(fmt.Sprintf("Doctor summary: %d/%d checks passed (%d advisory warning(s))", len(checks)-len(softFailed), len(checks), len(softFailed)))
		} else {
			out.OK(fmt.Sprintf("Doctor summary: %d/%d checks passed", len(checks), len(checks)))
		}
		return nil
	}

	if !doctorFixFlag {
		fmt.Println()
		out.Warn(fmt.Sprintf("Doctor summary: %d/%d checks passed — run with --fix to repair", len(checks)-len(failed)-len(softFailed), len(checks)))
		for _, c := range failed {
			if c.FixHint != "" {
				out.Info(fmt.Sprintf("  manual fix for %-12s %s", c.Name+":", c.FixHint))
			}
		}
		printSupportHint()
		return fmt.Errorf("some checks failed")
	}

	// ── Fix mode ─────────────────────────────────────────────────────────────
	fmt.Println()
	out.Section("Attempting repairs")

	fixable := 0
	fixed := 0
	failedNames := make([]string, 0, len(failed))
	fixedNames := make([]string, 0)
	for i := range checks {
		c := &checks[i]
		if c.OK || c.Fix == nil {
			if !c.OK && c.FixHint != "" {
				out.Warn(fmt.Sprintf("  %-12s cannot auto-fix: %s", c.Name, c.FixHint))
				failedNames = append(failedNames, c.Name)
			}
			continue
		}
		fixable++
		fmt.Printf("  → fixing %-12s", c.Name+"...")
		if err := c.Fix(); err != nil {
			fmt.Println(" ✗ failed")
			out.Err(fmt.Sprintf("    %v", err))
			failedNames = append(failedNames, c.Name)
		} else {
			fmt.Println(" ✓ fixed")
			fixed++
			fixedNames = append(fixedNames, c.Name)
		}
	}

	// Re-run checks to show updated state
	fmt.Println()
	out.Section("Re-checking")
	checks = buildChecks(platformDir)
	printChecks(out, checks)

	remaining := len(failedChecks(checks))
	total := len(checks)

	tc.Track("doctor_fixed", map[string]string{
		"fixed_count":     fmt.Sprintf("%d", fixed),
		"fixable_count":   fmt.Sprintf("%d", fixable),
		"still_failing":   fmt.Sprintf("%d", remaining),
		"fixed_checks":    strings.Join(fixedNames, ","),
		"failed_checks":   strings.Join(failedNames, ","),
	})

	fmt.Println()
	if remaining == 0 {
		out.OK(fmt.Sprintf("All %d checks passing — platform repaired", total))
		return nil
	}
	out.Warn(fmt.Sprintf("%d/%d checks passing (%d fixed, %d still failing)", total-remaining, total, fixed, remaining))
	printSupportHint()
	return fmt.Errorf("some checks could not be repaired automatically")
}

// buildChecks constructs all doctor checks with their fix closures.
func buildChecks(platformDir string) []doctorCheck {
	ins := &installer.Installer{PM: pm.Detect()}
	if platformDir != "" {
		if log, err := logger.New(platformDir); err == nil {
			ins.Log = log
		}
	}

	return []doctorCheck{
		checkPath(ins),
		checkBinary("node", "--version", "install Node.js from https://nodejs.org"),
		checkBinary("git", "--version", "install git from https://git-scm.com"),
		checkBinary("docker", "--version", "install Docker from https://docs.docker.com/get-docker"),
		checkNetwork(),
		checkKBCLI(platformDir, ins),
		checkKBDev(platformDir, ins),
		checkPlatform(platformDir, ins),
	}
}

func printChecks(out output, checks []doctorCheck) {
	for _, c := range checks {
		if c.OK {
			out.OK(fmt.Sprintf("%-12s %s", c.Name, c.Details))
		} else if c.Soft {
			out.Warn(fmt.Sprintf("%-12s %s", c.Name, c.Details))
		} else {
			out.Err(fmt.Sprintf("%-12s %s", c.Name, c.Details))
		}
	}
}

// failedChecks returns checks that are both failed and non-soft.
// Soft failures are advisory and do not affect the exit code.
func failedChecks(checks []doctorCheck) []doctorCheck {
	var out []doctorCheck
	for _, c := range checks {
		if !c.OK && !c.Soft {
			out = append(out, c)
		}
	}
	return out
}

// softFailedChecks returns advisory checks that failed (Soft=true, OK=false).
func softFailedChecks(checks []doctorCheck) []doctorCheck {
	var out []doctorCheck
	for _, c := range checks {
		if !c.OK && c.Soft {
			out = append(out, c)
		}
	}
	return out
}

// ── individual checks ─────────────────────────────────────────────────────────

func checkPath(ins *installer.Installer) doctorCheck {
	path := os.Getenv("PATH")
	target := os.ExpandEnv("$HOME/.local/bin")
	withSep := ":" + path + ":"
	needle := ":" + target + ":"
	if strings.Contains(withSep, needle) {
		return doctorCheck{Name: "PATH", OK: true, Details: target + " is present"}
	}
	return doctorCheck{
		Name:    "PATH",
		OK:      false,
		Details: target + " missing from PATH",
		Fix: func() error {
			hint, err := installer.RepairPATH()
			if err != nil {
				return err
			}
			if hint != "" {
				fmt.Printf("    run to activate: %s\n", hint)
			}
			return nil
		},
	}
}

func checkBinary(name, arg, hint string) doctorCheck {
	_, err := exec.LookPath(name)
	if err != nil {
		return doctorCheck{Name: name, OK: false, Details: "not found in PATH", FixHint: hint}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	// #nosec G204 -- command names/args are fixed diagnostics probes.
	out, err := exec.CommandContext(ctx, name, arg).CombinedOutput()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		return doctorCheck{Name: name, OK: false, Details: "found but failed: " + msg, FixHint: hint}
	}
	version := firstLine(strings.TrimSpace(string(out)))
	if version == "" {
		version = "ok"
	}
	return doctorCheck{Name: name, OK: true, Details: version}
}

func checkNetwork() doctorCheck {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodHead, "https://github.com", http.NoBody)
	if err != nil {
		return doctorCheck{Name: "network", OK: false, Soft: true, Details: err.Error()}
	}

	// #nosec G704 -- request target is a fixed trusted endpoint (github.com).
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return doctorCheck{Name: "network", OK: false, Soft: true, Details: "cannot reach github.com"}
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode >= http.StatusInternalServerError {
		return doctorCheck{Name: "network", OK: false, Soft: true, Details: fmt.Sprintf("github.com returned %d", resp.StatusCode)}
	}
	return doctorCheck{Name: "network", OK: true, Details: fmt.Sprintf("github.com reachable (%d)", resp.StatusCode)}
}

func checkKBCLI(platformDir string, ins *installer.Installer) doctorCheck {
	kbPath, err := exec.LookPath("kb")
	if err != nil {
		var fix func() error
		if platformDir != "" {
			fix = func() error { return ins.RepairCLI(platformDir) }
		}
		return doctorCheck{
			Name:    "kb",
			OK:      false,
			Details: "not in PATH",
			Fix:     fix,
			FixHint: "run kb-create to install",
		}
	}
	return doctorCheck{Name: "kb", OK: true, Details: kbPath}
}

func checkKBDev(platformDir string, ins *installer.Installer) doctorCheck {
	devPath, err := exec.LookPath("kb-dev")
	if err != nil {
		var fix func() error
		if platformDir != "" {
			fix = func() error {
				_, err := ins.RepairBinaries(platformDir)
				return err
			}
		}
		return doctorCheck{
			Name:    "kb-dev",
			OK:      false,
			Details: "not in PATH",
			Fix:     fix,
			FixHint: "run kb-create to install",
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	// #nosec G204 -- fixed command
	out, err := exec.CommandContext(ctx, devPath, "--version").CombinedOutput()
	if err != nil {
		return doctorCheck{Name: "kb-dev", OK: false, Details: "found but failed: " + err.Error()}
	}
	return doctorCheck{Name: "kb-dev", OK: true, Details: firstLine(strings.TrimSpace(string(out)))}
}

func checkPlatform(platformDir string, ins *installer.Installer) doctorCheck {
	if platformDir == "" {
		return doctorCheck{
			Name:    "platform",
			OK:      false,
			Details: "not found — use --platform or run kb-create first",
			FixHint: "run kb-create <project>",
		}
	}
	cfg, err := config.Read(platformDir)
	if err != nil {
		return doctorCheck{
			Name:    "platform",
			OK:      false,
			Details: "config unreadable: " + err.Error(),
			FixHint: "run kb-create <project>",
		}
	}

	nm := filepath.Join(platformDir, "node_modules")
	if _, err := os.Stat(nm); err != nil {
		return doctorCheck{
			Name:    "platform",
			OK:      false,
			Details: "node_modules missing at " + nm,
			Fix:     func() error { return ins.RepairNodeModules(platformDir) },
		}
	}

	pkgCount := len(cfg.Manifest.CorePackageNames())
	for _, s := range cfg.Manifest.Services {
		if cfg.IsServiceSelected(s.ID) {
			pkgCount++
		}
	}
	for _, p := range cfg.Manifest.Plugins {
		if cfg.IsPluginSelected(p.ID) {
			pkgCount++
		}
	}

	return doctorCheck{
		Name: "platform",
		OK:   true,
		Details: fmt.Sprintf("%s (%d packages, manifest %s)",
			platformDir, pkgCount, cfg.Manifest.Version),
	}
}

func firstLine(s string) string {
	if s == "" {
		return ""
	}
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}
