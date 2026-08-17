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

	"github.com/kb-labs/clikit/diag"
	"github.com/kb-labs/clikit/result"
	"github.com/kb-labs/create/internal/config"
	"github.com/kb-labs/create/internal/installer"
	"github.com/kb-labs/create/internal/logger"
	"github.com/kb-labs/create/internal/platform"
	"github.com/kb-labs/create/internal/pm"
	"github.com/kb-labs/create/internal/telemetry"
)

type doctorCheck struct {
	Name    string
	OK      bool
	Soft    bool // if true, failure is advisory (WARN, doesn't affect exit code)
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
	if outputMode() != result.ModeHuman {
		return renderDoctorMachine(cmd, checks)
	}

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
		"fixed_count":   fmt.Sprintf("%d", fixed),
		"fixable_count": fmt.Sprintf("%d", fixable),
		"still_failing": fmt.Sprintf("%d", remaining),
		"fixed_checks":  strings.Join(fixedNames, ","),
		"failed_checks": strings.Join(failedNames, ","),
	})

	fmt.Println()
	if remaining == 0 {
		out.OK(fmt.Sprintf("All %d checks passing — platform repaired", total))
		return nil
	}
	out.Warn(fmt.Sprintf("%d/%d checks passing (%d fixed, %d still failing)", total-remaining, total, fixed, remaining))
	return fmt.Errorf("some checks could not be repaired automatically")
}

func renderDoctorMachine(cmd *cobra.Command, checks []doctorCheck) error {
	payload := make([]map[string]any, 0, len(checks))
	failed := make([]string, 0)
	for _, check := range checks {
		payload = append(payload, map[string]any{"name": check.Name, "ok": check.OK, "advisory": check.Soft, "details": check.Details, "fixHint": check.FixHint})
		if !check.OK && !check.Soft {
			failed = append(failed, check.Name)
		}
	}
	if len(failed) > 0 {
		return diag.New(codeDoctor, "Environment checks did not pass", diag.WithReason("failed checks: "+strings.Join(failed, ", ")), diag.WithMeta(map[string]any{"checks": payload, "fixAvailable": doctorFixFlag}))
	}
	emit(cmd, result.Success("Environment checks passed", map[string]any{"checks": payload}), outputMode())
	return nil
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
		checkBinarySoft("docker", "--version", "install Docker from https://docs.docker.com/get-docker — only needed for devservices.yaml entries with type: docker"),
		checkNetwork(),
		checkKBCLI(platformDir, ins),
		checkKBDev(platformDir, ins),
		checkPlatform(platformDir, ins),
		checkBinarySymlinks(platformDir, ins),
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
	return checkBinaryImpl(name, arg, hint, false)
}

// checkBinarySoft is checkBinary for a binary that is not required for the
// base install/start flow (e.g. Docker, only needed for devservices.yaml
// entries with type: docker) — a missing/failing binary is advisory and
// must not fail the overall `doctor` exit code.
func checkBinarySoft(name, arg, hint string) doctorCheck {
	return checkBinaryImpl(name, arg, hint, true)
}

func checkBinaryImpl(name, arg, hint string, soft bool) doctorCheck {
	_, err := exec.LookPath(name)
	if err != nil {
		return doctorCheck{Name: name, OK: false, Soft: soft, Details: "not found in PATH", FixHint: hint}
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
		return doctorCheck{Name: name, OK: false, Soft: soft, Details: "found but failed: " + msg, FixHint: hint}
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

// binariesToCheck are the Go CLIs symlinked into ~/.local/bin whose install
// is owned by kb-create. "kb" is deliberately excluded — on Unix it's
// installed as a wrapper shell script (see installer.go), not a raw binary
// symlink, so the EvalSymlinks-based check below doesn't apply to it.
var binariesToCheck = []string{"kb-dev", "kb-devkit", "kb-deploy", "kb-monitor"}

// checkBinarySymlinks verifies that each ~/.local/bin/<name> entry actually
// resolves to a file under the current platform's install tree
// (<platformDir>/bin). This catches exactly the failure mode from an
// incident where these symlinks pointed into a /tmp build directory that
// macOS's periodic temp cleanup later reclaimed: kb-dev kept "existing" on
// PATH (checkKBDev passes) while silently resolving to nothing.
func checkBinarySymlinks(platformDir string, ins *installer.Installer) doctorCheck {
	if platformDir == "" {
		return doctorCheck{Name: "binaries", OK: true, Soft: true, Details: "skipped (no platform directory)"}
	}
	userBinDir, err := platform.UserBinDir()
	if err != nil {
		return doctorCheck{Name: "binaries", OK: false, Soft: true, Details: "could not resolve ~/.local/bin: " + err.Error()}
	}
	check := checkBinariesAgainst(platformDir, userBinDir)
	if check.OK || check.Soft {
		return check
	}
	check.Fix = func() error {
		_, err := ins.RepairBinaries(platformDir)
		return err
	}
	return check
}

// checkBinariesAgainst is the testable core of checkBinarySymlinks: given an
// explicit userBinDir (real ~/.local/bin in production, a temp dir in
// tests), verify every binary THIS platform actually installed (i.e. one
// that has a real file under <platformDir>/bin) resolves correctly through
// its ~/.local/bin symlink. Kept side-effect-free (no Fix closure) so tests
// never need an *installer.Installer.
//
// Deliberately does not require every name in binariesToCheck to point at
// this platform: ~/.local/bin is a single global location shared by every
// platform install on the machine (that's the whole point of it being on
// PATH), so a binary this platform never selected — e.g. a scratch/dev
// install that only installs kb-dev — legitimately keeps pointing at
// whichever other platform install last claimed it. Flagging that as
// broken would be a false positive, not a real symlink-rot incident.
func checkBinariesAgainst(platformDir, userBinDir string) doctorCheck {
	platformBinDir, err := filepath.EvalSymlinks(filepath.Join(platformDir, "bin"))
	if err != nil {
		// Nothing installed under <platformDir>/bin yet — checkPlatform/
		// checkKBDev already report the more fundamental problem.
		return doctorCheck{Name: "binaries", OK: true, Soft: true, Details: "skipped (no " + filepath.Join(platformDir, "bin") + ")"}
	}

	var broken []string
	for _, name := range binariesToCheck {
		installedHere := filepath.Join(platformBinDir, name)
		if _, statErr := os.Stat(installedHere); statErr != nil {
			// This platform never installed this binary — nothing to own,
			// nothing to check (see doc comment above).
			continue
		}
		linkPath := filepath.Join(userBinDir, name)
		if _, statErr := os.Lstat(linkPath); statErr != nil {
			// Missing entirely — checkKBDev (or an equivalent) already
			// reports this for kb-dev; other binaries are optional installs.
			continue
		}
		target, evalErr := filepath.EvalSymlinks(linkPath)
		if evalErr != nil {
			broken = append(broken, name+" (target missing)")
			continue
		}
		if !strings.HasPrefix(target, platformBinDir+string(filepath.Separator)) && target != platformBinDir {
			broken = append(broken, fmt.Sprintf("%s (points outside %s: %s)", name, platformBinDir, target))
		}
	}

	if len(broken) == 0 {
		return doctorCheck{Name: "binaries", OK: true, Details: fmt.Sprintf("%s symlinks OK", userBinDir)}
	}
	return doctorCheck{
		Name:    "binaries",
		OK:      false,
		Details: strings.Join(broken, ", "),
		FixHint: "run kb-create doctor --fix",
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
