package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"

	"github.com/kb-labs/create/internal/claude"
	"github.com/kb-labs/create/internal/config"
	"github.com/kb-labs/create/internal/platform"
	"github.com/kb-labs/create/internal/userstate"
)

var flagUninstallYes bool

var uninstallCmd = &cobra.Command{
	Use:   "uninstall",
	Short: "Remove an installed platform",
	Long: `Removes the platform directory, project .kb config, and CLI symlinks.

This is a destructive operation — all installed packages, configs,
and cached data in the platform directory will be deleted.`,
	RunE: runUninstall,
}

func init() {
	rootCmd.AddCommand(uninstallCmd)
	uninstallCmd.Flags().BoolVarP(&flagUninstallYes, "yes", "y", false, "skip confirmation prompt")
}

func runUninstall(cmd *cobra.Command, args []string) error {
	out := newOutput()

	platformDir, err := resolvePlatformDir(cmd)
	if err != nil {
		return err
	}

	cfg, err := config.Read(platformDir)
	if err != nil {
		return err
	}

	out.Section("Uninstall KB Labs")
	out.KeyValue("Platform", platformDir)
	out.KeyValue("Project", cfg.CWD)
	fmt.Println()

	out.Warn("This will permanently delete:")
	fmt.Printf("  • %s (all packages, configs, logs)\n", platformDir)
	fmt.Printf("  • %s/.kb/ (project config)\n", cfg.CWD)
	fmt.Printf("  • ~/.local/bin/kb (CLI symlink)\n")
	fmt.Printf("  • ~/.local/bin/kb-dev (service manager symlink)\n")
	fmt.Println()

	if !flagUninstallYes && !confirmDestructive("Are you sure? [y/N] ") {
		out.Info("Cancelled.")
		return nil
	}

	// Remove Claude Code assets first (skills + managed CLAUDE.md section).
	// Done before the platform dir is removed so that the resolver can still
	// find the devkit manifest if needed for diagnostics. Failures here are
	// non-fatal — the rest of the uninstall must proceed regardless.
	if cr, cerr := claude.Uninstall(claude.Options{
		ProjectDir:  cfg.CWD,
		PlatformDir: platformDir,
		Yes:         true,
	}); cerr != nil {
		out.Warn(fmt.Sprintf("claude assets: %v (continuing)", cerr))
	} else if cr != nil && (len(cr.SkillsRemoved) > 0 || cr.ClaudeMdAction != "") {
		printClaudeSummary(out, cr)
	}

	// Remove CLI wrappers and binaries from user bin dir.
	if binDir, err := platform.UserBinDir(); err == nil {
		for _, name := range []string{"kb", "kb.cmd", "kb-dev", "kb-dev.exe"} {
			p := filepath.Join(binDir, name)
			if err := os.Remove(p); err == nil {
				out.OK(fmt.Sprintf("Removed %s", p))
			}
		}
	}

	// Remove project .kb dir.
	projectKB := filepath.Join(cfg.CWD, ".kb")
	if err := os.RemoveAll(projectKB); err == nil {
		out.OK(fmt.Sprintf("Removed %s", projectKB))
	} else if !os.IsNotExist(err) {
		out.Warn(fmt.Sprintf("Could not remove %s: %v", projectKB, err))
	}

	// Remove platform directory.
	if err := os.RemoveAll(platformDir); err != nil {
		return fmt.Errorf("remove platform dir: %w", err)
	}
	out.OK(fmt.Sprintf("Removed %s", platformDir))

	// Clear the "last known install" pointer so subsequent kb-create
	// commands don't auto-discover a platform that no longer exists.
	if err := userstate.Clear(); err != nil {
		out.Warn(fmt.Sprintf("clear user state: %v", err))
	}

	fmt.Println()
	out.OK("Uninstall complete")
	return nil
}
