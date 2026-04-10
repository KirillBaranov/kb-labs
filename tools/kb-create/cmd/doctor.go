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
)

type doctorCheck struct {
	Name    string
	OK      bool
	Details string
}

var doctorCmd = &cobra.Command{
	Use:   "doctor",
	Short: "Run environment diagnostics",
	Long:  "Checks local prerequisites and connectivity used by kb-create.",
	RunE:  runDoctor,
}

func init() {
	rootCmd.AddCommand(doctorCmd)
}

func runDoctor(cmd *cobra.Command, args []string) error {
	out := newOutput()
	platformDir, _ := resolvePlatformDir(cmd)

	checks := []doctorCheck{
		checkPath(),
		checkBinary("node", "--version"),
		checkBinary("git", "--version"),
		checkBinary("docker", "--version"),
		checkNetwork(),
		checkKBCLI(),
		checkKBDev(),
		checkPlatform(platformDir),
	}

	okCount := 0
	out.Section("Environment Doctor")
	for _, c := range checks {
		if c.OK {
			okCount++
			out.OK(fmt.Sprintf("%-12s %s", c.Name, c.Details))
		} else {
			out.Err(fmt.Sprintf("%-12s %s", c.Name, c.Details))
		}
	}

	fmt.Println()
	summary := fmt.Sprintf("Doctor summary: %d/%d checks passed", okCount, len(checks))
	if okCount != len(checks) {
		out.Warn(summary)
		return fmt.Errorf("some checks failed")
	}
	out.OK(summary)
	return nil
}

func checkPath() doctorCheck {
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
		Details: target + " is missing (add: export PATH=\"$HOME/.local/bin:$PATH\")",
	}
}

func checkBinary(name, arg string) doctorCheck {
	_, err := exec.LookPath(name)
	if err != nil {
		return doctorCheck{Name: name, OK: false, Details: "not found in PATH"}
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
		return doctorCheck{Name: name, OK: false, Details: "found but failed: " + msg}
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
		return doctorCheck{Name: "network", OK: false, Details: err.Error()}
	}

	// #nosec G704 -- request target is a fixed trusted endpoint (github.com).
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return doctorCheck{Name: "network", OK: false, Details: "cannot reach github.com"}
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode >= http.StatusInternalServerError {
		return doctorCheck{Name: "network", OK: false, Details: fmt.Sprintf("github.com returned %d", resp.StatusCode)}
	}
	return doctorCheck{Name: "network", OK: true, Details: fmt.Sprintf("github.com reachable (%d)", resp.StatusCode)}
}

func checkKBCLI() doctorCheck {
	kbPath, err := exec.LookPath("kb")
	if err != nil {
		return doctorCheck{Name: "kb", OK: false, Details: "not in PATH (run kb-create to install)"}
	}
	return doctorCheck{Name: "kb", OK: true, Details: kbPath}
}

func checkKBDev() doctorCheck {
	devPath, err := exec.LookPath("kb-dev")
	if err != nil {
		return doctorCheck{Name: "kb-dev", OK: false, Details: "not in PATH (run kb-create to install)"}
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

func checkPlatform(platformDir string) doctorCheck {
	if platformDir == "" {
		return doctorCheck{Name: "platform", OK: false, Details: "not found (use --platform or run kb-create first)"}
	}
	cfg, err := config.Read(platformDir)
	if err != nil {
		return doctorCheck{Name: "platform", OK: false, Details: err.Error()}
	}

	// Check node_modules exists
	nm := filepath.Join(platformDir, "node_modules")
	if _, err := os.Stat(nm); err != nil {
		return doctorCheck{Name: "platform", OK: false, Details: "node_modules missing at " + nm}
	}

	// Count installed packages
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
