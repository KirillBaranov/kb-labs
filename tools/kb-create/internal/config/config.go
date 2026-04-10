// Package config manages the platform configuration file written to
// <platformDir>/.kb/kb.config.json. The schema is versioned to support
// forward-compatible migrations.
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/types"
)

const (
	configVersion = 1
	configDir     = ".kb"
	configFile    = "kb.config.json"
)

// TelemetryConfig holds anonymous telemetry preferences. Stored inside
// PlatformConfig so that both kb-create and kb-labs-cli share the same
// deviceId and consent flag — single source of truth.
type TelemetryConfig struct {
	Enabled  bool   `json:"enabled"`
	DeviceID string `json:"deviceId"`
	// Gateway credentials (populated on first telemetry send).
	ClientID     string `json:"clientId,omitempty"`
	ClientSecret string `json:"clientSecret,omitempty"` // #nosec G117 -- stored in user-local config (0600), not exposed
}

// ProjectProfile is stored as an opaque JSON object so that the config
// package does not depend on the detect package. The detect package
// produces the struct; config merely persists it.
type ProjectProfile = map[string]any

// PlatformConfig is the persistent state written to <platform>/.kb/kb.config.json.
// Version field enables future migrations.
type PlatformConfig struct {
	InstalledAt      time.Time         `json:"installedAt"`
	Platform         string            `json:"platform"`
	CWD              string            `json:"cwd"`
	PM               string            `json:"pm"`
	Manifest         manifest.Manifest `json:"manifest"`
	SelectedServices []string          `json:"selectedServices"` // component IDs chosen at install
	SelectedPlugins  []string          `json:"selectedPlugins"`  // component IDs chosen at install
	Telemetry        TelemetryConfig   `json:"telemetry"`
	Project          ProjectProfile    `json:"project,omitempty"`
	Demo             types.DemoConfig  `json:"demo,omitempty"`
	Version          int               `json:"version"`
}

// IsServiceSelected returns true if the service was chosen during install.
func (c *PlatformConfig) IsServiceSelected(id string) bool {
	for _, s := range c.SelectedServices {
		if s == id {
			return true
		}
	}
	return false
}

// IsPluginSelected returns true if the plugin was chosen during install.
func (c *PlatformConfig) IsPluginSelected(id string) bool {
	for _, p := range c.SelectedPlugins {
		if p == id {
			return true
		}
	}
	return false
}

// InstalledPackageNames returns the package names that were actually installed
// (core + selected services + selected plugins).
func (c *PlatformConfig) InstalledPackageNames() []string {
	pkgs := c.Manifest.CorePackageNames()
	for _, svc := range c.Manifest.Services {
		if c.IsServiceSelected(svc.ID) {
			pkgs = append(pkgs, svc.Pkg)
		}
	}
	for _, pl := range c.Manifest.Plugins {
		if c.IsPluginSelected(pl.ID) {
			pkgs = append(pkgs, pl.Pkg)
		}
	}
	return pkgs
}

// ConfigPath returns the path to the config file for the given platform directory.
func ConfigPath(platformDir string) string {
	return filepath.Join(platformDir, configDir, configFile)
}

// Write persists config to <platformDir>/.kb/kb.config.json.
func Write(platformDir string, cfg *PlatformConfig) error {
	dir := filepath.Join(platformDir, configDir)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}

	path := filepath.Join(dir, configFile)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return fmt.Errorf("write config: %w", err)
	}
	return nil
}

// Read loads and parses the config from <platformDir>/.kb/kb.config.json.
func Read(platformDir string) (*PlatformConfig, error) {
	path := ConfigPath(platformDir)
	// #nosec G304 -- path is deterministic (<platformDir>/.kb/kb.config.json).
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("no config found at %s — is the platform installed?", path)
		}
		return nil, fmt.Errorf("read config: %w", err)
	}

	var cfg PlatformConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	// Future: handle cfg.Version < configVersion migrations here.

	return &cfg, nil
}

// NewConfig creates a fresh PlatformConfig ready to be written.
func NewConfig(platformDir, cwd, pmName string, m *manifest.Manifest, t TelemetryConfig) *PlatformConfig {
	abs, _ := filepath.Abs(platformDir)
	absCWD, _ := filepath.Abs(cwd)
	return &PlatformConfig{
		Version:     configVersion,
		Platform:    abs,
		CWD:         absCWD,
		PM:          pmName,
		InstalledAt: time.Now().UTC(),
		Manifest:    *m,
		Telemetry:   t,
	}
}
