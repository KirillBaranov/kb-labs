package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"

	"github.com/kb-labs/create/internal/config"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show installation status",
	RunE:  runStatus,
}

func init() {
	rootCmd.AddCommand(statusCmd)
}

// axisSummary formats a version axis for display: "pinned <version>" for an
// exact pin (no channel), "<channel> (<version>)" when pre-flight resolved
// a concrete version for a tracked channel, or bare "<channel>" when no
// resolution happened (e.g. no compatibility matrix to trigger it).
func axisSummary(channel, version string) string {
	switch {
	case channel == "" && version != "":
		return "pinned " + version
	case channel != "" && version != "":
		return fmt.Sprintf("%s (%s)", channel, version)
	case channel != "":
		return channel
	default:
		return "unknown"
	}
}

func runStatus(cmd *cobra.Command, args []string) error {
	platformDir, err := resolvePlatformDir(cmd)
	if err != nil {
		return err
	}

	cfg, err := config.Read(platformDir)
	if err != nil {
		return err
	}

	out := newOutput()

	out.Section("Installation Status")
	out.KeyValue("Platform", cfg.Platform)
	out.KeyValue("Project", cfg.CWD)
	out.KeyValue("PM", cfg.PM)
	out.KeyValue("Registry", cfg.Source.EffectiveRegistry())
	out.KeyValue("SDK", axisSummary(cfg.Source.SDKChannel, cfg.Source.SDKVersion))
	out.KeyValue("Platform", axisSummary(cfg.Source.PlatformChannel, cfg.Source.PlatformVersion))
	installedLine := cfg.InstalledAt.Format("2006-01-02 15:04")
	if cfg.Source.InstalledBy != "" {
		installedLine += "  via " + cfg.Source.InstalledBy
	}
	out.KeyValue("Installed", installedLine)
	if !cfg.UpdatedAt.IsZero() {
		updatedLine := cfg.UpdatedAt.Format("2006-01-02 15:04")
		if cfg.UpdatedBy != "" {
			updatedLine += "  via " + cfg.UpdatedBy
		}
		out.KeyValue("Updated", updatedLine)
	}
	out.KeyValue("Manifest", cfg.Manifest.Version)

	// core
	out.Section("Core packages")
	for _, p := range cfg.Manifest.Core {
		out.Bullet(p.Name, "")
	}

	// services
	if len(cfg.Manifest.Services) > 0 {
		out.Section("Services")
		for _, s := range cfg.Manifest.Services {
			if cfg.IsServiceSelected(s.ID) {
				out.Bullet(s.ID, s.Description)
			} else {
				out.BulletDim(s.ID, "not installed")
			}
		}
	}

	// plugins
	if len(cfg.Manifest.Plugins) > 0 {
		out.Section("Plugins")
		for _, p := range cfg.Manifest.Plugins {
			if cfg.IsPluginSelected(p.ID) {
				out.Bullet(p.ID, p.Description)
			} else {
				out.BulletDim(p.ID, "not installed")
			}
		}
	}

	// binaries
	if len(cfg.Manifest.Binaries) > 0 {
		out.Section("Binaries")
		for _, b := range cfg.Manifest.Binaries {
			binPath := filepath.Join(platformDir, "bin", b.Name)
			if _, err := os.Stat(binPath); err == nil {
				out.Bullet(b.Name, b.Description)
			} else {
				out.BulletDim(b.Name, "not installed")
			}
		}
	}

	fmt.Println()
	return nil
}
