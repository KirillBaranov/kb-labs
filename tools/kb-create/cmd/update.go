package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/kb-labs/create/internal/claude"
	"github.com/kb-labs/create/internal/config"
	"github.com/kb-labs/create/internal/installer"
	"github.com/kb-labs/create/internal/logger"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/pm"
	"github.com/kb-labs/create/internal/selfupdate"
	"github.com/kb-labs/create/internal/telemetry"
	"github.com/kb-labs/create/internal/userstate"
)

var updateCmd = &cobra.Command{
	Use:   "update",
	Short: "Update an installed platform",
	Long: `Compares the current manifest against the installed snapshot,
shows what changed, and applies updates after confirmation.`,
	RunE: runUpdate,
}

func init() {
	rootCmd.AddCommand(updateCmd)
}

func runUpdate(cmd *cobra.Command, args []string) error {
	out := newOutput()

	platformDir, err := resolvePlatformDir(cmd)
	if err != nil {
		return err
	}

	m, err := manifest.LoadDefault()
	if err != nil {
		return fmt.Errorf("load manifest: %w", err)
	}

	log, err := logger.New(platformDir)
	if err != nil {
		return err
	}
	defer func() { _ = log.Close() }()

	ins := &installer.Installer{
		PM:  pm.Detect(),
		Log: log,
	}

	// Init telemetry from the platform config. Non-fatal: if config is
	// unreadable (e.g. first run before install) we get a Nop client.
	var tc *telemetry.Client
	if cfg, cfgErr := config.Read(platformDir); cfgErr == nil {
		tc = initTelemetry(rootCmd.Version, &cfg.Telemetry)
	} else {
		tc = telemetry.Nop()
	}
	defer tc.Flush()

	out.Info("Checking for updates...")

	// Self-update kb-create binary before touching platform packages.
	if didSelfUpdate := runSelfUpdate(out, tc); didSelfUpdate {
		// Re-exec with the freshly downloaded binary so refreshDerivedConfigs
		// and all subsequent logic run with the new code.
		exe, exeErr := selfupdate.ExecutablePath()
		if exeErr == nil {
			_ = syscall.Exec(exe, os.Args, os.Environ())
		}
		// syscall.Exec only returns on failure — fall through and continue.
	}

	diff, err := ins.Diff(platformDir, m)
	if err != nil {
		return err
	}

	if !diff.HasChanges() {
		out.OK("Already up to date")
		return nil
	}

	printDiff(out, diff)

	if !confirm("Apply updates? [Y/n] ") {
		tc.Track("update_cancelled", nil)
		out.Warn("Cancelled.")
		return nil
	}

	tc.Track("update_started", map[string]string{
		"packages_added":   fmt.Sprintf("%d", len(diff.Added)),
		"packages_updated": fmt.Sprintf("%d", len(diff.Updated)),
		"packages_removed": fmt.Sprintf("%d", len(diff.Removed)),
	})
	start := time.Now()

	result, err := ins.Update(platformDir, m)
	if err != nil {
		tc.Track("update_failed", map[string]string{"error": err.Error()})
		return fmt.Errorf("update failed: %w", err)
	}

	tc.Track("update_completed", map[string]string{
		"duration_ms":      fmt.Sprintf("%d", time.Since(start).Milliseconds()),
		"packages_added":   fmt.Sprintf("%d", len(diff.Added)),
		"packages_updated": fmt.Sprintf("%d", len(diff.Updated)),
		"packages_removed": fmt.Sprintf("%d", len(diff.Removed)),
	})
	out.OK(fmt.Sprintf("Update complete (%s)", result.Duration.Round(100*time.Millisecond)))

	// Refresh Claude Code assets from the just-updated devkit. Non-fatal:
	// the platform itself is already updated; missing or broken assets must
	// not block the user.
	if !flagSkipClaude {
		cfg, cfgErr := config.Read(platformDir)
		if cfgErr != nil {
			log.Printf("claude assets: %v (continuing)", cfgErr)
		} else {
			cr, cerr := claude.Update(claude.Options{
				ProjectDir:   cfg.CWD,
				PlatformDir:  platformDir,
				SkipClaudeMd: flagNoClaudeMd,
				Yes:          false,
				Log:          log,
				Prompter:     stdPrompter{},
			})
			if cerr != nil {
				log.Printf("claude assets: %v (continuing)", cerr)
			} else if cr != nil {
				printClaudeSummary(out, cr)
			}
		}
	}

	return nil
}

func printDiff(out output, d *installer.UpdateDiff) {
	out.Section("Update plan")

	if len(d.Added) > 0 {
		out.Info("Add:")
		for _, p := range d.Added {
			fmt.Printf("  %s %s\n", out.bullet.Render("+"), p)
		}
	}
	if len(d.Updated) > 0 {
		out.Info("Update:")
		for _, p := range d.Updated {
			fmt.Printf("  %s %s\n", out.bullet.Render("↑"), out.dim.Render(p))
		}
	}
	if len(d.Removed) > 0 {
		out.Info("Remove:")
		for _, p := range d.Removed {
			fmt.Printf("  %s %s\n", out.bullet.Render("-"), p)
		}
	}
	fmt.Println()
}

func confirm(prompt string) bool {
	fmt.Print(prompt)
	r := bufio.NewReader(os.Stdin)
	line, _ := r.ReadString('\n')
	line = strings.TrimSpace(strings.ToLower(line))
	return line == "" || line == "y" || line == "yes"
}

// runSelfUpdate checks GitHub for a newer *-binaries release and replaces the
// running binary if one is found. Returns true when the binary was replaced.
func runSelfUpdate(out output, tc *telemetry.Client) bool {
	const repo = "KirillBaranov/kb-labs"
	currentVersion := rootCmd.Version

	latestTag, err := selfupdate.LatestBinariesTag(repo)
	if err != nil {
		out.Warn(fmt.Sprintf("self-update check failed: %v (skipping)", err))
		return false
	}

	if !selfupdate.NeedsUpdate(currentVersion, latestTag) {
		return false
	}

	out.Info(fmt.Sprintf("New kb-create version available: %s → %s", currentVersion, latestTag))

	result, err := selfupdate.Apply(repo, latestTag, currentVersion)
	if err != nil {
		tc.Track("self_update_failed", map[string]string{
			"from_version": currentVersion,
			"to_version":   latestTag,
			"error":        err.Error(),
		})
		out.Warn(fmt.Sprintf("self-update failed: %v (continuing with current version)", err))
		return false
	}

	tc.Track("self_update_completed", map[string]string{
		"from_version": result.PreviousVersion,
		"to_version":   result.LatestVersion,
	})
	out.OK(fmt.Sprintf("kb-create updated to %s", result.LatestVersion))
	return true
}

// confirmDestructive requires explicit "y" or "yes" — empty input = no.
func confirmDestructive(prompt string) bool {
	fmt.Print(prompt)
	r := bufio.NewReader(os.Stdin)
	line, _ := r.ReadString('\n')
	line = strings.TrimSpace(strings.ToLower(line))
	return line == "y" || line == "yes"
}

// resolvePlatformDir returns the platform dir, trying in order:
//  1. --platform flag on this command
//  2. --platform persistent flag on the root command
//  3. .kb/kb.config.json in the current working directory
//  4. user state file (last successful install)
//
// (4) makes `kb-create status` (and friends) work right after install
// without requiring the user to remember where the platform was placed.
// Stale state (dir no longer exists) is ignored — we fall through to the
// "not specified" error so the user gets a clear message rather than a
// confusing "config not found" further down the stack.
func resolvePlatformDir(cmd *cobra.Command) (string, error) {
	if p, _ := cmd.Flags().GetString("platform"); p != "" {
		return p, nil
	}
	if p, _ := cmd.Root().PersistentFlags().GetString("platform"); p != "" {
		return p, nil
	}
	// Try reading config from current directory.
	cwd, _ := os.Getwd()
	if cfg, err := config.Read(cwd); err == nil {
		return cfg.Platform, nil
	}
	// Fall back to the last known install.
	if st, err := userstate.Read(); err == nil && st != nil && st.LastPlatformDir != "" {
		if _, statErr := os.Stat(st.LastPlatformDir); statErr == nil {
			return st.LastPlatformDir, nil
		}
	}
	return "", fmt.Errorf("platform directory not specified — use --platform or run from the platform directory")
}
