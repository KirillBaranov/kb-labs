package cmd

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"

	"github.com/kb-labs/create/internal/config"
	"github.com/kb-labs/create/internal/engine/bootstrap"
	"github.com/kb-labs/create/internal/engine/direct"
	"github.com/kb-labs/create/internal/engine/executor"
	engineplan "github.com/kb-labs/create/internal/engine/plan"
	engineruntime "github.com/kb-labs/create/internal/engine/runtime"
	"github.com/kb-labs/create/internal/pm"
	"github.com/kb-labs/create/internal/userstate"
)

var updateCmd = &cobra.Command{
	Use:   "update",
	Short: "Update an installed platform",
	Long:  "Rebuilds the desired state from the installed manifest snapshot and applies its declarative update plan.",
	RunE:  runUpdate,
}

func init() {
	updateCmd.Flags().BoolP("yes", "y", false, "skip confirmation prompts")
	updateCmd.Flags().Bool("force", false, "reset config to defaults (discards LLM and custom adapter settings)")
	updateCmd.Flags().String("registry", "", "npm registry URL (e.g. http://localhost:4873 for local verdaccio)")
	rootCmd.AddCommand(updateCmd)
}

func runUpdate(cmd *cobra.Command, args []string) error {
	yes, _ := cmd.Flags().GetBool("yes")
	registry, _ := cmd.Flags().GetString("registry")
	platformDir, err := resolvePlatformDir(cmd)
	if err != nil {
		return err
	}
	return runDeclarativeUpdate(cmd, platformDir, yes, registry)
}

func runDeclarativeUpdate(cmd *cobra.Command, platformDir string, yes bool, registry string) error {
	out := newOutput()
	current, err := config.Read(platformDir)
	if err != nil {
		return err
	}
	catalog, err := bootstrap.DefaultCatalog()
	if err != nil {
		return fmt.Errorf("load declarative catalog: %w", err)
	}
	force, _ := cmd.Flags().GetBool("force")
	var plugins, services *[]string
	if !force {
		selectedPlugins := append([]string(nil), current.SelectedPlugins...)
		selectedServices := append([]string(nil), current.SelectedServices...)
		plugins, services = &selectedPlugins, &selectedServices
	}
	var directConfig []byte
	if !force {
		directConfig, err = json.Marshal(direct.Config{Effects: append([]string(nil), current.SelectedEffects...)})
		if err != nil {
			return err
		}
	}
	request, err := direct.Build(direct.Input{
		Plugins:       plugins,
		Services:      services,
		Config:        directConfig,
		ProjectRoot:   current.CWD,
		PlatformRoot:  platformDir,
		CatalogDigest: catalog.Digest,
	}, catalog)
	if err != nil {
		return fmt.Errorf("build update request: %w", err)
	}
	request.RefreshPackages = true
	request.Source = engineplan.SourceDirect
	compiled, err := engineplan.Compile(request, catalog)
	if err != nil {
		return fmt.Errorf("compile update plan: %w", err)
	}
	printHumanPlanSummary(cmd.OutOrStdout(), compiled)
	if !yes && !confirm("Apply declarative update? [Y/n] ") {
		out.Warn("Cancelled.")
		return nil
	}
	journal, err := engineruntime.Apply(context.Background(), compiled, engineruntime.Options{
		PackageManager: pm.Detect(pm.DetectOptions{Registry: registry}),
		JournalDir:     filepath.Join(platformDir, ".kb", "kb-create", "runs"),
		LockPath:       filepath.Join(platformDir, ".kb", "kb-create", "locks", "update.lock"),
		Rollback:       true,
	})
	if err != nil {
		return fmt.Errorf("declarative update failed: %w", err)
	}
	if err := writeDeclarativeInstallState(compiled); err != nil {
		return fmt.Errorf("write declarative install state: %w", err)
	}
	completed := 0
	for _, entry := range journal.Entries {
		if entry.Status == executor.StatusCompleted {
			completed++
		}
	}
	out.OK(fmt.Sprintf("Declarative update complete (%d actions)", completed))
	return nil
}

func confirm(prompt string) bool {
	fmt.Print(prompt)
	r := bufio.NewReader(os.Stdin)
	line, _ := r.ReadString('\n')
	line = strings.TrimSpace(strings.ToLower(line))
	return line == "" || line == "y" || line == "yes"
}

func confirmDestructive(prompt string) bool {
	fmt.Print(prompt)
	r := bufio.NewReader(os.Stdin)
	line, _ := r.ReadString('\n')
	line = strings.TrimSpace(strings.ToLower(line))
	return line == "y" || line == "yes"
}

func resolveUpdateRegistry(flagRegistry, platformDir string) string {
	if flagRegistry != "" {
		return flagRegistry
	}
	if cfg, err := config.Read(platformDir); err == nil && cfg.Source.Registry != "" {
		return cfg.Source.Registry
	}
	return ""
}

func resolvePlatformDir(cmd *cobra.Command) (string, error) {
	if p, _ := cmd.Flags().GetString("platform"); p != "" {
		return p, nil
	}
	if p, _ := cmd.Root().PersistentFlags().GetString("platform"); p != "" {
		return p, nil
	}
	cwd, _ := os.Getwd()
	if cfg, err := config.Read(cwd); err == nil {
		return cfg.Platform, nil
	}
	if state, err := userstate.Read(); err == nil && state != nil && state.LastPlatformDir != "" {
		if _, statErr := os.Stat(state.LastPlatformDir); statErr == nil {
			return state.LastPlatformDir, nil
		}
	}
	return "", fmt.Errorf("platform directory not specified — use --platform or run from the platform directory")
}
