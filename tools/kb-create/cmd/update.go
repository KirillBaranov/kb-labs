package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/kb-labs/create/internal/claude"
	"github.com/kb-labs/create/internal/config"
	"github.com/kb-labs/create/internal/installer"
	"github.com/kb-labs/create/internal/logger"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/pm"
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

	out.Info("Checking for updates...")
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
		out.Warn("Cancelled.")
		return nil
	}

	result, err := ins.Update(platformDir, m)
	if err != nil {
		return fmt.Errorf("update failed: %w", err)
	}

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

// confirmDestructive requires explicit "y" or "yes" — empty input = no.
func confirmDestructive(prompt string) bool {
	fmt.Print(prompt)
	r := bufio.NewReader(os.Stdin)
	line, _ := r.ReadString('\n')
	line = strings.TrimSpace(strings.ToLower(line))
	return line == "y" || line == "yes"
}

// resolvePlatformDir returns the platform dir from --platform flag or config in cwd.
func resolvePlatformDir(cmd *cobra.Command) (string, error) {
	if p, _ := cmd.Flags().GetString("platform"); p != "" {
		return p, nil
	}
	if p, _ := cmd.Root().PersistentFlags().GetString("platform"); p != "" {
		return p, nil
	}
	// Try reading config from current directory.
	cwd, _ := os.Getwd()
	cfg, err := config.Read(cwd)
	if err == nil {
		return cfg.Platform, nil
	}
	return "", fmt.Errorf("platform directory not specified — use --platform or run from the platform directory")
}
