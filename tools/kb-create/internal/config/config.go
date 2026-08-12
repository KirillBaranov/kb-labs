// Package config manages kb-create's install state, written to
// <platformDir>/.kb/install.json. This is kb-create's own bookkeeping
// (manifest snapshot, selected components, telemetry, provenance) — NOT the
// platform runtime config. The runtime config (adapters, gateway, services)
// lives in kb.config.jsonc, owned by internal/scaffold. Keeping install state
// out of the kb.config.* namespace avoids colliding with the platform config
// the loader recognises. The schema is versioned for forward-compatible
// migrations; older installs wrote state to kb.config.json and are migrated on
// first read (see Read).
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/kb-labs/create/internal/engine/migrate"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/types"
)

const (
	configVersion = 2
	configSchema  = "kb.install-state/2"
	configDir     = ".kb"
	// installStateFile is kb-create's own state file. It deliberately lives
	// outside the kb.config.* namespace owned by the platform runtime config.
	installStateFile = "install.json"
	// legacyStateFile is the pre-migration name; Read/Write migrate it away so
	// the kb.config.* namespace belongs solely to the platform runtime config.
	legacyStateFile = "kb.config.json"
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

// InstallSource records where and how the platform was installed or last updated.
type InstallSource struct {
	// Registry is the npm registry URL used during install/update.
	// Empty means the default (https://registry.npmjs.org/).
	Registry    string    `json:"registry,omitempty"`
	InstalledBy string    `json:"installedBy,omitempty"` // "kb-create@1.4.2"
	InstalledAt time.Time `json:"installedAt"`

	// SDKChannel/PlatformChannel record which release channel ("stable" or
	// "canary") each version axis was tracking as of the last install/update.
	// SDKVersion/PlatformVersion record the concrete resolved version (not
	// the dist-tag) — set either from an exact --*-version pin or from the
	// pre-flight registry resolution of the channel. Read back by `update`
	// (sticky channel default) and displayed by `status`.
	SDKChannel      string `json:"sdkChannel,omitempty"`
	SDKVersion      string `json:"sdkVersion,omitempty"`
	PlatformChannel string `json:"platformChannel,omitempty"`
	PlatformVersion string `json:"platformVersion,omitempty"`
}

// EffectiveRegistry returns the registry URL, falling back to the public npm default.
func (s InstallSource) EffectiveRegistry() string {
	if s.Registry != "" {
		return s.Registry
	}
	return "https://registry.npmjs.org/"
}

// PlatformConfig is kb-create's install state, written to
// <platform>/.kb/install.json. Version field enables future migrations.
type PlatformConfig struct {
	Schema           string            `json:"schema"`
	Mode             string            `json:"mode,omitempty"`
	ScenarioID       string            `json:"scenarioId,omitempty"`
	Answers          map[string]any    `json:"answers,omitempty"`
	ConfigSchemas    map[string]int    `json:"configSchemas,omitempty"`
	LastPlanHash     string            `json:"lastPlanHash,omitempty"`
	Provenance       []string          `json:"provenance,omitempty"`
	InstalledAt      time.Time         `json:"installedAt"`
	Platform         string            `json:"platform"`
	CWD              string            `json:"cwd"`
	PM               string            `json:"pm"`
	Manifest         manifest.Manifest `json:"manifest"`
	SelectedServices []string          `json:"selectedServices"`          // component IDs chosen at install
	SelectedPlugins  []string          `json:"selectedPlugins"`           // component IDs chosen at install
	SelectedEffects  []string          `json:"selectedEffects,omitempty"` // manifest effect IDs selected at install
	Telemetry        TelemetryConfig   `json:"telemetry"`
	Project          ProjectProfile    `json:"project,omitempty"`
	Demo             types.DemoConfig  `json:"demo,omitempty"`
	Version          int               `json:"version"`

	// Source records install/update provenance (registry URL, kb-create version, timestamp).
	Source    InstallSource `json:"source,omitempty"`
	UpdatedAt time.Time     `json:"updatedAt,omitempty"`
	UpdatedBy string        `json:"updatedBy,omitempty"` // "kb-create@1.4.3"
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

// IsEffectSelected reports whether a manifest configuration effect was part of
// the last declarative install/update plan.
func (c *PlatformConfig) IsEffectSelected(id string) bool {
	for _, effect := range c.SelectedEffects {
		if effect == id {
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

// ConfigPath returns the path to kb-create's install-state file for the given
// platform directory (<platformDir>/.kb/install.json).
func ConfigPath(platformDir string) string {
	return filepath.Join(platformDir, configDir, installStateFile)
}

// Write persists install state to <platformDir>/.kb/install.json and removes any
// legacy kb.config.json install-state left by an older kb-create, so the
// kb.config.* namespace stays reserved for the platform runtime config.
func Write(platformDir string, cfg *PlatformConfig) error {
	dir := filepath.Join(platformDir, configDir)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}

	path := filepath.Join(dir, installStateFile)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return fmt.Errorf("write config: %w", err)
	}
	removeLegacyInstallState(dir)
	return nil
}

// Read loads kb-create's install state from <platformDir>/.kb/install.json.
// For installs created before the rename it transparently migrates the legacy
// <platformDir>/.kb/kb.config.json (only when that file is genuinely install
// state, never a hand-written runtime config).
func Read(platformDir string) (*PlatformConfig, error) {
	path := ConfigPath(platformDir)
	// #nosec G304 -- path is deterministic (<platformDir>/.kb/install.json).
	data, err := os.ReadFile(path)
	if err == nil {
		cfg, parseErr := parseConfig(data)
		if parseErr != nil {
			return nil, parseErr
		}
		if cfg.Schema == "" || cfg.Schema != configSchema {
			from := "1"
			if cfg.Schema != "" {
				from = strings.TrimPrefix(cfg.Schema, "kb.install-state/")
			}
			migrated, migrationErr := migrateInstallState(data, from, "2")
			if migrationErr != nil {
				return nil, fmt.Errorf("migrate install state: %w", migrationErr)
			}
			if err := Write(platformDir, mustConfig(migrated)); err != nil {
				return nil, fmt.Errorf("persist migrated install state: %w", err)
			}
			return parseConfig(migrated)
		}
		return cfg, nil
	}
	if !os.IsNotExist(err) {
		return nil, fmt.Errorf("read config: %w", err)
	}

	// install.json is absent — try migrating legacy kb.config.json install state.
	legacy := filepath.Join(platformDir, configDir, legacyStateFile)
	// #nosec G304 -- path is deterministic (<platformDir>/.kb/kb.config.json).
	legacyData, lerr := os.ReadFile(legacy)
	if lerr != nil {
		if os.IsNotExist(lerr) {
			return nil, fmt.Errorf("no config found at %s — is the platform installed?", path)
		}
		return nil, fmt.Errorf("read config: %w", lerr)
	}
	cfg, perr := parseConfig(legacyData)
	if perr != nil || !looksLikeInstallState(cfg) {
		// Not kb-create install state (e.g. a hand-written runtime config that
		// happens to be named kb.config.json). Leave it untouched.
		return nil, fmt.Errorf("no config found at %s — is the platform installed?", path)
	}
	if migrated, migrationErr := migrateInstallState(legacyData, "1", "2"); migrationErr != nil {
		return nil, fmt.Errorf("migrate legacy config: %w", migrationErr)
	} else if migrated != nil {
		legacyData = migrated
		cfg, perr = parseConfig(legacyData)
		if perr != nil {
			return nil, fmt.Errorf("parse migrated config: %w", perr)
		}
	}
	// Persist under the new name and drop the legacy file (Write handles both).
	if werr := Write(platformDir, cfg); werr != nil {
		return nil, fmt.Errorf("migrate legacy config: %w", werr)
	}
	return cfg, nil
}

func mustConfig(data []byte) *PlatformConfig {
	var cfg PlatformConfig
	_ = json.Unmarshal(data, &cfg)
	return &cfg
}

func migrateInstallState(data []byte, from, to string) ([]byte, error) {
	source, err := manifest.LoadDefault()
	if err != nil {
		return nil, err
	}
	raw, err := json.Marshal(source.Migrations)
	if err != nil {
		return nil, err
	}
	var definitions []migrate.Definition
	if err := json.Unmarshal(raw, &definitions); err != nil {
		return nil, err
	}
	chain, err := migrate.Resolve(definitions, "kb.install-state", from, to)
	if err != nil {
		return nil, err
	}
	result, err := migrate.Apply(data, chain)
	if err != nil {
		return nil, err
	}
	return result, nil
}

// parseConfig unmarshals install-state JSON into a PlatformConfig.
func parseConfig(data []byte) (*PlatformConfig, error) {
	var cfg PlatformConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}
	return &cfg, nil
}

// looksLikeInstallState reports whether a parsed config carries kb-create
// install-state markers. Used to avoid migrating/removing a file that is not
// actually install state (e.g. a user's runtime config named kb.config.json).
func looksLikeInstallState(cfg *PlatformConfig) bool {
	return cfg.Version > 0 ||
		cfg.Source.InstalledBy != "" ||
		len(cfg.SelectedServices) > 0 ||
		len(cfg.SelectedPlugins) > 0 ||
		len(cfg.Manifest.Core) > 0 ||
		len(cfg.Manifest.Services) > 0 ||
		len(cfg.Manifest.Plugins) > 0
}

// removeLegacyInstallState deletes <kbDir>/kb.config.json when it parses as
// kb-create install state. A non-install-state file (runtime config) is left
// intact so we never clobber a user-owned kb.config.json.
func removeLegacyInstallState(kbDir string) {
	legacy := filepath.Join(kbDir, legacyStateFile)
	// #nosec G304 -- path is deterministic (<kbDir>/kb.config.json).
	data, err := os.ReadFile(legacy)
	if err != nil {
		return
	}
	if cfg, perr := parseConfig(data); perr == nil && looksLikeInstallState(cfg) {
		_ = os.Remove(legacy)
	}
}

// NewConfig creates a fresh PlatformConfig ready to be written.
// registry is the custom npm registry URL used during install (empty = default).
// installedBy is the kb-create version string, e.g. "kb-create@1.4.2".
func NewConfig(platformDir, cwd, pmName, registry, installedBy string, m *manifest.Manifest, t TelemetryConfig) *PlatformConfig {
	abs, _ := filepath.Abs(platformDir)
	absCWD, _ := filepath.Abs(cwd)
	now := time.Now().UTC()
	return &PlatformConfig{
		Schema:        configSchema,
		Mode:          "direct",
		ConfigSchemas: map[string]int{"platform": 1, "project": 1},
		Version:       configVersion,
		Platform:      abs,
		CWD:           absCWD,
		PM:            pmName,
		InstalledAt:   now,
		Manifest:      *m,
		Telemetry:     t,
		Source: InstallSource{
			Registry:    registry,
			InstalledBy: installedBy,
			InstalledAt: now,
		},
	}
}
