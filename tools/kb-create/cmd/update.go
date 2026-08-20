package cmd

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"

	"github.com/kb-labs/create/internal/config"
	enginecatalog "github.com/kb-labs/create/internal/engine/catalog"
	"github.com/kb-labs/create/internal/engine/direct"
	"github.com/kb-labs/create/internal/engine/executor"
	engineplan "github.com/kb-labs/create/internal/engine/plan"
	engineruntime "github.com/kb-labs/create/internal/engine/runtime"
	"github.com/kb-labs/create/internal/logger"
	"github.com/kb-labs/create/internal/manifest"
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
	updateCmd.Flags().String("sdk-channel", "", `track a release channel for the SDK: "stable" or "canary" (defaults to the channel used by the last install/update)`)
	updateCmd.Flags().String("platform-channel", "", `track a release channel for core+adapters+every service+every plugin: "stable" or "canary" (defaults to the channel used by the last install/update)`)
	updateCmd.Flags().Bool("force-compat", false, "update even if the resolved SDK/Platform versions violate the release's compatibility matrix")
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
	sdkChannelFlag, _ := cmd.Flags().GetString("sdk-channel")
	platformChannelFlag, _ := cmd.Flags().GetString("platform-channel")
	forceCompat, _ := cmd.Flags().GetBool("force-compat")
	axes := manifest.ResolvedAxes{
		SDK:      stickyAxis(sdkChannelFlag, current.Source.SDKChannel),
		Platform: stickyAxis(platformChannelFlag, current.Source.PlatformChannel),
	}
	manager := pm.Detect(pm.DetectOptions{Registry: registry})
	if err := ensureToolchain(true, manager.Name()); err != nil {
		return fmt.Errorf("toolchain preflight failed: %w", err)
	}
	manifestNow, err := manifest.LoadDefault()
	if err != nil {
		return fmt.Errorf("load declarative manifest: %w", err)
	}
	if err := preflightCompatibility(&axes, manifestNow, manager, forceCompat, out); err != nil {
		return err
	}
	platformOverrides := manifest.ApplyAxisResolution(manifestNow, axes)
	manager = pm.Detect(pm.DetectOptions{
		Registry:         registry,
		PackageOverrides: manifest.PackageManagerOverrides(axes),
	})
	catalog, err := enginecatalog.FromManifest(*manifestNow)
	if err != nil {
		return fmt.Errorf("compile declarative catalog: %w", err)
	}
	force, _ := cmd.Flags().GetBool("force")
	if !force {
		previous, marshalErr := json.Marshal(current.Manifest)
		if marshalErr != nil {
			return marshalErr
		}
		now, marshalErr := json.Marshal(manifestNow)
		if marshalErr != nil {
			return marshalErr
		}
		if bytes.Equal(previous, now) {
			out.OK("Declarative platform already up to date")
			return nil
		}
	}
	var plugins, services *[]string
	if !force {
		selectedPlugins := append([]string(nil), current.SelectedPlugins...)
		selectedServices := append([]string(nil), current.SelectedServices...)
		selectedPlugins = canonicalizeComponentIDs(selectedPlugins, "plugin")
		selectedServices = canonicalizeComponentIDs(selectedServices, "service")
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
		Plugins:          plugins,
		Services:         services,
		Config:           directConfig,
		ProjectRoot:      current.CWD,
		PlatformRoot:     platformDir,
		CatalogDigest:    catalog.Digest,
		PackageOverrides: platformOverrides,
		Binaries:         intentBinaries(current.ScenarioID, manifestNow),
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
	log, err := logger.NewFileOnly(platformDir)
	if err != nil {
		return fmt.Errorf("create declarative update log: %w", err)
	}
	rememberRunLog(log)
	defer func() { _ = log.Close() }()
	journal, err := engineruntime.Apply(context.Background(), compiled, engineruntime.Options{
		PackageManager: manager,
		JournalDir:     filepath.Join(platformDir, ".kb", "kb-create", "runs"),
		LockPath:       filepath.Join(platformDir, ".kb", "kb-create", "locks", "update.lock"),
		Rollback:       true,
		Progress:       logPackageManagerProgress(log),
		Emit:           installationProgress(cmd.OutOrStdout(), compiled),
	})
	if err != nil {
		return fmt.Errorf("declarative update failed: %w", err)
	}
	if err := writeDeclarativeInstallState(compiled, manifestNow, axes); err != nil {
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

func intentBinaries(intentID string, source *manifest.Manifest) []string {
	if intent := source.IntentByID(intentID); intent != nil {
		return append([]string(nil), intent.Bundle.Binaries...)
	}
	return nil
}

func canonicalizeComponentIDs(ids []string, kind string) []string {
	result := make([]string, 0, len(ids))
	for _, id := range ids {
		if strings.HasPrefix(id, kind+":") {
			result = append(result, id)
			continue
		}
		result = append(result, kind+":"+id)
	}
	return result
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
