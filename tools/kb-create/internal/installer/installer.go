// Package installer orchestrates the KB Labs platform installation and update
// lifecycle. It delegates package operations to a pm.PackageManager and
// persists the resulting configuration via the config package.
package installer

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/kb-labs/create/internal/bindown"
	"github.com/kb-labs/create/internal/config"
	"github.com/kb-labs/create/internal/detect"
	"github.com/kb-labs/create/internal/devservices"
	"github.com/kb-labs/create/internal/gateway"
	"github.com/kb-labs/create/internal/logger"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/platform"
	"github.com/kb-labs/create/internal/pm"
	"github.com/kb-labs/create/internal/scaffold"
	"github.com/kb-labs/create/internal/scan"
	"github.com/kb-labs/create/internal/types"
	"github.com/kb-labs/create/internal/userstate"
)

// Selection holds what the user chose to install.
type Selection struct {
	PlatformDir                      string
	ProjectCWD                       string
	Services                         []string // component IDs
	Plugins                          []string // component IDs
	Binaries                         []string // binary IDs to install
	Telemetry                        config.TelemetryConfig
	Project                          *detect.ProjectProfile // detected project info (may be nil)
	DemoMode                         bool
	DevMode                          bool   // true when --dev-manifest flag is set; enables pnpm pack pre-step
	Registry                         string // optional: custom npm registry URL (e.g. http://localhost:4873)
	Consent                          types.ConsentChoice
	APIKey                           string `json:"-"` // only when Consent == types.ConsentOwnKey // #nosec G117 -- not serialized
	TelemetryEnabled                 bool
	LLMEnabled                       bool   // user explicitly opted in to LLM via wizard or --llm flag
	LLMProvider                      string // "openai" | "anthropic" | "" (skip)
	LLMKey                           string `json:"-"` // API key for the chosen provider // #nosec G117
	LocalMode                        bool   // user chose local single-user mode (gateway auth off, loopback bind)
	AllowIncompatibleLegacyMigration bool
	// ClaudeEnabled controls the optional KB Labs agent setup: managed skills
	// under .claude/skills/kb-labs-* plus a separately marked CLAUDE.md section.
	// It never authorizes replacing user-authored files.
	ClaudeEnabled bool
	// SkipClaudeMd keeps the skills-only option available to the CLI flag while
	// preserving user-owned CLAUDE.md content.
	SkipClaudeMd bool
	// Adapters overrides which package backs a given capability role (e.g.
	// "cache" -> "@kb-labs/adapters-redis@0.2.0"), from the chosen intent's
	// bundle or the custom picker's adapter-role opt-ins.
	Adapters map[string]string
	// EnvValues are extra secret-shaped values collected by an intent's
	// "envVar" wizard step (e.g. {"NPM_TOKEN": "..."}), written to .env the
	// same way as LLMKey.
	EnvValues map[string]string `json:"-"` // #nosec G117 -- not serialized
	// Intent is the chosen wizard intent's ID (e.g. "release", "explore"),
	// used post-install to print that intent's docs/next-steps. Empty when
	// the selection didn't come from the intent-driven wizard (e.g. a future
	// direct API caller).
	Intent string
	// FirstCommand is copied from the selected intent's outcome contract. It
	// gives post-install code one stable, safe command to hand back to the
	// user instead of deriving it from generic help text.
	FirstCommand *manifest.FirstCommand
	// PendingInput describes a valid install whose first command needs user
	// input (for example, a commit plan on a clean repository). It is not an
	// installation error and is persisted for `kb-create continue`.
	PendingInput string
	// CustomCommandName and CustomCommandDescription form the user-approved
	// contract for the custom-plugin path. They are plain product intent, not
	// credentials or prompt content.
	CustomCommandName        string
	CustomCommandDescription string
	// PluginVersions/ServiceVersions override the installed version for a
	// specific component ID (e.g. `--plugins=release@0.2.0`), keyed by that
	// ID. Separate maps because a service and a plugin can share the same
	// catalog ID (e.g. "marketplace" is both) with independently pinned
	// versions. Absent/empty entries fall back to Component.PackageSpec()'s
	// normal @latest (or @file:path in dev mode) resolution.
	PluginVersions  map[string]string
	ServiceVersions map[string]string
}

// Result is returned after a successful Install.
type Result struct {
	PlatformDir string
	ProjectCWD  string
	ConfigPath  string
	Duration    time.Duration

	// InstalledBinaries lists Go binaries (e.g. "kb-dev") that were
	// successfully installed into the platform bin dir. Consumers use this
	// to decide which onboarding commands to suggest — an empty list means
	// the service manager is not available, so "kb-dev start" must not be
	// printed as a next step.
	InstalledBinaries []string
	// HasServices is true if the manifest declared at least one runnable
	// service. Together with InstalledBinaries this is enough to decide
	// whether "start services" makes sense as a next step.
	HasServices bool
	// ServicesWarning is set when the user selected services but the
	// post-install manifest scan failed or found none, so devservices.yaml
	// was not written and `kb-dev start` will fail with "no config found".
	// Empty when the scan succeeded (or no services were selected). The
	// caller should print this prominently — see printNextSteps in cmd/create.go.
	ServicesWarning string
	// Gateway is the discovery-derived gateway plan. The caller passes it to
	// scaffold.WritePlatformConfig so the dynamic upstreams/transport land in
	// the single platform config (kb.config.jsonc). nil if no gateway-prefixed
	// services were discovered.
	Gateway *gateway.Plan
	// InstalledPlugins lists the plugins the post-install manifest scan found,
	// for callers that want to inspect their static manifest data (e.g.
	// `kb-create install` prints env-var hints from each plugin's
	// dist/manifest.json). Empty when the scan failed or found no plugins.
	InstalledPlugins []scan.PluginEntry
}

// FinalizeDeclarative materializes outputs selected by the declarative plan
// after its package and config actions have completed.
func (ins *Installer) FinalizeDeclarative(sel *Selection, m *manifest.Manifest) (*Result, error) {
	if sel == nil || m == nil || ins.Log == nil {
		return nil, fmt.Errorf("declarative finalization requires selection, manifest, and logger")
	}
	start := time.Now()
	installedBinaries, err := ins.installBinaries(sel.PlatformDir, filterBinaries(m.Binaries, sel.Binaries))
	if err != nil {
		return nil, fmt.Errorf("install required binaries: %w", err)
	}
	scanResult, err := scan.Run(sel.PlatformDir)
	if err != nil {
		return nil, fmt.Errorf("scan installed manifests: %w", err)
	}
	ins.Log.Printf("  found %d plugins, %d adapters, %d services",
		len(scanResult.Plugins), len(scanResult.Adapters), len(scanResult.Services))
	for _, e := range scanResult.Errors {
		ins.Log.Printf("  [WARN] %s: %s", e.Package, e.Error)
	}
	gatewayPlan := buildGatewayPlan(scanResult, m)
	var gatewayAuthEnabled *bool
	gatewayHost := ""
	bootstrapAdminEmail := ""
	bootstrapTenantID := ""
	bootstrapAdminPassword := ""
	if sel.LocalMode {
		authEnabled := false
		gatewayAuthEnabled = &authEnabled
		gatewayHost = "127.0.0.1"
	} else if slices.Contains(sel.Services, "gateway") {
		// Non-local installs that select the gateway service run with auth
		// enabled but otherwise have no way to obtain a credential (#271):
		// `kb auth login` needs a client-id/secret nobody has, and
		// `/auth/register` needs an already-authenticated admin, which a
		// fresh install has none of. Seed a bootstrap admin so the gateway
		// auto-provisions the CLI's first credential on first start. This
		// mirrors the pre-declarative-launcher wiring that generated a fresh
		// random password per install (writeEnvFile below only writes it to
		// .env the first time, so re-running install never rotates it out
		// from under an already-bootstrapped gateway).
		authEnabled := true
		gatewayAuthEnabled = &authEnabled
		bootstrapAdminEmail = envOrDefault("GATEWAY_BOOTSTRAP_ADMIN_EMAIL", "admin@bootstrap.local")
		bootstrapTenantID = envOrDefault("GATEWAY_BOOTSTRAP_TENANT_ID", "default")
		bootstrapAdminPassword = generateBootstrapAdminPassword()
	}
	if err := scaffold.WritePlatformConfig(sel.PlatformDir, scaffold.Options{
		PlatformDir:            sel.PlatformDir,
		Services:               sel.Services,
		Plugins:                sel.Plugins,
		Adapters:               sel.Adapters,
		Catalog:                m,
		DemoMode:               sel.DemoMode,
		GatewayAuthEnabled:     gatewayAuthEnabled,
		GatewayHost:            gatewayHost,
		BootstrapAdminEmail:    bootstrapAdminEmail,
		BootstrapTenantID:      bootstrapTenantID,
		BootstrapAdminPassword: bootstrapAdminPassword,
		Gateway:                gatewayPlan,
	}); err != nil {
		return nil, fmt.Errorf("write platform config: %w", err)
	}
	if err := scan.WriteConfigs(sel.PlatformDir, scanResult, sel.ProjectCWD); err != nil {
		return nil, fmt.Errorf("write discovered configs: %w", err)
	}
	ins.logPluginManifests(sel.PlatformDir, scanResult.Plugins)
	ins.symlinkCLI(sel.PlatformDir)
	if sel.ProjectCWD != "" {
		if err := scaffold.WriteProjectConfig(sel.ProjectCWD, scaffold.Options{
			PlatformDir:                      sel.PlatformDir,
			Services:                         sel.Services,
			Plugins:                          sel.Plugins,
			DemoMode:                         sel.DemoMode,
			Adapters:                         sel.Adapters,
			Catalog:                          m,
			GatewayAuthEnabled:               gatewayAuthEnabled,
			GatewayHost:                      gatewayHost,
			BootstrapAdminEmail:              bootstrapAdminEmail,
			BootstrapTenantID:                bootstrapTenantID,
			BootstrapAdminPassword:           bootstrapAdminPassword,
			Gateway:                          gatewayPlan,
			AllowIncompatibleLegacyMigration: sel.AllowIncompatibleLegacyMigration,
		}); err != nil {
			return nil, fmt.Errorf("write project config: %w", err)
		}
	}
	if err := userstate.Write(&userstate.State{LastPlatformDir: sel.PlatformDir, LastProjectDir: sel.ProjectCWD}); err != nil {
		ins.Log.Printf("  [WARN] write user state: %v", err)
	}
	return &Result{PlatformDir: sel.PlatformDir, ProjectCWD: sel.ProjectCWD, ConfigPath: config.ConfigPath(sel.PlatformDir), Duration: time.Since(start), InstalledBinaries: installedBinaries, HasServices: len(scanResult.Services) > 0, Gateway: gatewayPlan, InstalledPlugins: scanResult.Plugins}, nil
}

// UpdateDiff describes changes between the installed manifest and the current one.
type UpdateDiff struct {
	Updated []string // packages with version changes
	Added   []string // new packages
	Removed []string // removed packages
}

// HasChanges returns true if there is anything to update.
func (d *UpdateDiff) HasChanges() bool {
	return len(d.Updated)+len(d.Added)+len(d.Removed) > 0
}

// UpdateResult is returned after a successful Update.
type UpdateResult struct {
	Diff     *UpdateDiff
	Duration time.Duration
	// Gateway is the freshly re-derived gateway plan (services may have been
	// added/removed). The caller renders it into kb.config.jsonc so gateway
	// upstreams never go stale after an update. nil if no gateway services.
	Gateway *gateway.Plan
}

// Installer orchestrates platform installation and updates.
type Installer struct {
	PM      pm.PackageManager
	Log     *logger.Logger
	Version string                              // kb-create version, e.g. "1.4.2" (used for provenance)
	OnStep  func(step, total int, label string) // called at each named stage
	OnLine  func(line string)                   // called for each raw output line from pm
}

// Install installs the platform according to sel.
// All selected packages are passed to the package manager in a single
// invocation so it can resolve and deduplicate the dependency graph at once.
func (ins *Installer) Install(sel *Selection, m *manifest.Manifest) (*Result, error) {
	start := time.Now()

	totalSteps := 3 // packages + scan + config (binaries add +1)
	if len(m.Binaries) > 0 {
		totalSteps = 4
	}
	step := 0

	// Step 1: npm/pnpm packages.
	allPkgs := m.CorePackageSpecs()
	allPkgs = append(allPkgs, m.AdapterPackageSpecs()...)
	// Explicit adapter selections are allowed to extend or replace the
	// manifest defaults. They must be installed as real package artifacts, not
	// merely written into the generated runtime config.
	for _, adapter := range sel.Adapters {
		if adapter != "" {
			allPkgs = append(allPkgs, adapter)
		}
	}
	allPkgs = append(allPkgs, ins.selectedPkgSpecs(m.Services, sel.Services, sel.ServiceVersions)...)
	allPkgs = append(allPkgs, ins.selectedPkgSpecs(m.Plugins, sel.Plugins, sel.PluginVersions)...)

	// Install companion plugins for selected services (e.g. workflow-daemon → workflow-entry).
	for _, svc := range m.Services {
		if svc.Plugin != "" && slices.Contains(sel.Services, svc.ID) {
			allPkgs = append(allPkgs, svc.Plugin)
		}
	}

	// Dev mode: pack local directory specs into self-contained tarballs so
	// pnpm can resolve workspace:* and link: refs inside those packages.
	// Only runs when --dev-manifest flag was provided (sel.DevMode == true).
	if sel.DevMode {
		ins.Log.Printf("  [dev] packing local packages into tarballs...")
		packed, cleanup, packErr := packLocalDirSpecs(allPkgs, ins.Log)
		defer cleanup()
		if packErr != nil {
			return nil, fmt.Errorf("pack local packages: %w", packErr)
		}
		allPkgs = packed
	}

	step++
	ins.step(step, totalSteps, fmt.Sprintf("Installing %d packages via %s", len(allPkgs), ins.PM.Name()))
	if err := ins.installGroup(sel.PlatformDir, allPkgs); err != nil {
		return nil, fmt.Errorf("install: %w", err)
	}

	// Step 2: Go binaries from GitHub Releases — filtered by user selection.
	selectedBins := filterBinaries(m.Binaries, sel.Binaries)
	var installedBinaries []string
	if len(selectedBins) > 0 {
		step++
		ins.step(step, totalSteps, fmt.Sprintf("Installing %d binaries", len(selectedBins)))
		var binErr error
		installedBinaries, binErr = ins.installBinaries(sel.PlatformDir, selectedBins)
		if binErr != nil {
			return nil, fmt.Errorf("install required binaries: %w", binErr)
		}
	}

	// Step 3: Scan installed packages for manifests → generate marketplace.lock + devservices.yaml.
	// (Gateway upstreams are rebuilt a few steps down via refreshDerivedConfigs
	// — kept scoped here because the Step counter is driven from the install flow.)
	step++
	ins.step(step, totalSteps, "Scanning manifests")
	scanResult, scanErr := scan.Run(sel.PlatformDir)
	var servicesWarning string
	if scanErr != nil {
		ins.Log.Printf("  [WARN] manifest scan failed: %v", scanErr)
		if ins.OnLine != nil {
			ins.OnLine(fmt.Sprintf("WARN: manifest scan: %v", scanErr))
		}
		if len(sel.Services) > 0 {
			servicesWarning = fmt.Sprintf("manifest scan failed (%v) — devservices.yaml was not written, "+
				"so `kb-dev start` will fail. Run `kb-create update` to retry the scan.", scanErr)
		}
	} else {
		ins.Log.Printf("  found %d plugins, %d adapters, %d services",
			len(scanResult.Plugins), len(scanResult.Adapters), len(scanResult.Services))
		for _, e := range scanResult.Errors {
			ins.Log.Printf("  [WARN] %s: %s", e.Package, e.Error)
		}
		if err := scan.WriteConfigs(sel.PlatformDir, scanResult, sel.ProjectCWD); err != nil {
			ins.Log.Printf("  [WARN] write configs: %v", err)
			if len(sel.Services) > 0 {
				servicesWarning = fmt.Sprintf("failed to write devservices.yaml (%v) — "+
					"`kb-dev start` will fail. Run `kb-create update` to retry.", err)
			}
		} else if len(sel.Services) > 0 && len(scanResult.Services) == 0 {
			servicesWarning = "selected services were not found in the installed packages, " +
				"so devservices.yaml was not written and `kb-dev start` will fail. " +
				"Run `kb-create update` to retry the scan."
		}
		ins.logPluginManifests(sel.PlatformDir, scanResult.Plugins)
	}

	// Symlink kb CLI into ~/.local/bin/ for PATH availability.
	ins.symlinkCLI(sel.PlatformDir)

	// Create the project .kb/ directory. The installer owns this so that
	// all callers (CLI, tests) get a consistent project layout regardless
	// of how they invoke Install. The scaffold step (kb.config.jsonc) is
	// written by cmd/create.go on top of this foundation.
	if sel.ProjectCWD != "" {
		if err := os.MkdirAll(filepath.Join(sel.ProjectCWD, ".kb"), 0o750); err != nil {
			return nil, fmt.Errorf("create project .kb dir: %w", err)
		}
	}

	step++
	ins.step(step, totalSteps, "Writing config")
	installedBy := ""
	if ins.Version != "" {
		installedBy = "kb-create@" + ins.Version
	}
	cfg := config.NewConfig(sel.PlatformDir, sel.ProjectCWD, ins.PM.Name(), ins.PM.RegistryURL(), installedBy, m, sel.Telemetry)
	cfg.SelectedServices = sel.Services
	cfg.SelectedPlugins = sel.Plugins
	if sel.Project != nil {
		cfg.Project = sel.Project.ToMap()
	}
	if err := config.Write(sel.PlatformDir, cfg); err != nil {
		return nil, fmt.Errorf("config: %w", err)
	}

	// Derive the gateway plan from discovered services + manifest gateway info.
	// The plan is returned to the caller, which renders it into the single
	// platform config (kb.config.jsonc) via scaffold — see Result.Gateway.
	gatewayPlan := buildGatewayPlan(scanResult, m)

	// Persist "last known install" so subsequent kb-create commands
	// (status/doctor/update/uninstall) can auto-discover the platform
	// without requiring --platform every time. Non-fatal: a failure here
	// just means the user has to pass --platform manually.
	if err := userstate.Write(&userstate.State{
		LastPlatformDir: sel.PlatformDir,
		LastProjectDir:  sel.ProjectCWD,
	}); err != nil {
		ins.Log.Printf("  [WARN] write user state: %v", err)
	}

	hasServices := scanErr == nil && len(scanResult.Services) > 0
	var installedPlugins []scan.PluginEntry
	if scanErr == nil {
		installedPlugins = scanResult.Plugins
	}

	return &Result{
		PlatformDir:       sel.PlatformDir,
		ProjectCWD:        sel.ProjectCWD,
		ConfigPath:        config.ConfigPath(sel.PlatformDir),
		Duration:          time.Since(start),
		InstalledBinaries: installedBinaries,
		HasServices:       hasServices,
		ServicesWarning:   servicesWarning,
		Gateway:           gatewayPlan,
		InstalledPlugins:  installedPlugins,
	}, nil
}

// buildGatewayPlan derives the gateway plan from a scan result and the manifest's
// service → gateway-prefix map. Returns nil when discovery is unavailable or no
// service declares a gateway prefix (e.g. gateway/studio only).
func buildGatewayPlan(scanResult *scan.ScanResult, m *manifest.Manifest) *gateway.Plan {
	if scanResult == nil {
		return nil
	}
	infoMap := make(map[string]scan.ServiceGatewayInfo)
	for _, svc := range m.Services {
		if svc.GatewayPrefix != "" {
			infoMap[svc.ID] = scan.ServiceGatewayInfo{
				Prefix:    svc.GatewayPrefix,
				Rewrite:   svc.GatewayRewrite,
				WebSocket: svc.GatewayWebSocket,
			}
		}
	}
	if len(infoMap) == 0 {
		return nil
	}
	return scan.GenerateGatewayConfig(scanResult, infoMap)
}

// Diff computes what would change if Update were applied now.
// "installed" is derived from the saved manifest + user selection.
// "desired" is derived from the new manifest + same user selection.
func (ins *Installer) Diff(platformDir string, current *manifest.Manifest) (*UpdateDiff, error) {
	cfg, err := config.Read(platformDir)
	if err != nil {
		return nil, err
	}

	installed := installedSet(cfg)
	desired := desiredSet(current, cfg.SelectedServices, cfg.SelectedPlugins)

	diff := &UpdateDiff{}
	for pkg := range desired {
		if _, ok := installed[pkg]; !ok {
			diff.Added = append(diff.Added, pkg)
		} else {
			diff.Updated = append(diff.Updated, pkg)
		}
	}
	for pkg := range installed {
		if _, ok := desired[pkg]; !ok {
			diff.Removed = append(diff.Removed, pkg)
		}
	}
	return diff, nil
}

// Update applies the diff: installs new packages, updates existing ones.
func (ins *Installer) Update(platformDir string, current *manifest.Manifest) (*UpdateResult, error) {
	start := time.Now()

	diff, err := ins.Diff(platformDir, current)
	if err != nil {
		return nil, err
	}

	cfg, err := config.Read(platformDir)
	if err != nil {
		return nil, err
	}

	if len(diff.Added) > 0 {
		ins.Log.Printf("Installing new packages: %s", strings.Join(diff.Added, " "))
		if err := ins.installGroup(platformDir, diff.Added); err != nil {
			return nil, fmt.Errorf("add new packages: %w", err)
		}
	}

	allPkgs := cfg.InstalledPackageNames()
	if err := ins.updateGroup(platformDir, allPkgs); err != nil {
		return nil, fmt.Errorf("update packages: %w", err)
	}

	// Refresh config snapshot.
	cfg.Manifest = *current
	cfg.UpdatedAt = time.Now().UTC()
	if ins.Version != "" {
		cfg.UpdatedBy = "kb-create@" + ins.Version
	}
	if r := ins.PM.RegistryURL(); r != "" {
		cfg.Source.Registry = r
	}
	if err := config.Write(platformDir, cfg); err != nil {
		return nil, err
	}

	// Re-scan installed manifests and rebuild derived configs
	// (marketplace.lock, devservices.yaml, gateway upstreams) so they
	// reflect any package additions/removals from this update. Without
	// this the gateway stays on whatever upstreams were written at install
	// time and silently 404s after a new service package is added.
	gatewayPlan := ins.refreshDerivedConfigs(platformDir, current)

	return &UpdateResult{Diff: diff, Duration: time.Since(start), Gateway: gatewayPlan}, nil
}

// refreshDerivedConfigs re-runs the manifest scanner and rewrites the
// derived config files (marketplace.lock, devservices.yaml, gateway
// upstreams) from the current state of the platform's node_modules.
//
// Called from both Install and Update so the two paths stay in sync and
// gateway upstreams never go stale after `kb-create update`.
func (ins *Installer) refreshDerivedConfigs(platformDir string, m *manifest.Manifest) *gateway.Plan {
	scanResult, scanErr := scan.Run(platformDir)
	if scanErr != nil {
		ins.Log.Printf("  [WARN] manifest scan failed: %v", scanErr)
		return nil
	}

	ins.Log.Printf("  found %d plugins, %d adapters, %d services",
		len(scanResult.Plugins), len(scanResult.Adapters), len(scanResult.Services))
	for _, e := range scanResult.Errors {
		ins.Log.Printf("  [WARN] %s: %s", e.Package, e.Error)
	}
	if err := scan.WriteConfigs(platformDir, scanResult, ""); err != nil {
		ins.Log.Printf("  [WARN] write configs: %v", err)
	}

	// Re-derive gateway upstreams from the manifest's service → prefix map.
	// Returned to the caller, which re-renders kb.config.jsonc so gateway
	// upstreams reflect any added/removed service packages.
	return buildGatewayPlan(scanResult, m)
}

// ── helpers ──────────────────────────────────────────────────────────────────

// envOrDefault returns os.Getenv(key) when non-empty, else def.
func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// generateBootstrapAdminPassword returns 32 random bytes as a 64-char hex
// string, used to seed the gateway's bootstrap admin account (#271) for
// non-local installs that select the gateway service.
func generateBootstrapAdminPassword() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("fallback-%d-%d", os.Getpid(), time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

func (ins *Installer) step(n, total int, label string) {
	ins.Log.Printf("[%d/%d] %s", n, total, label)
	if ins.OnStep != nil {
		ins.OnStep(n, total, label)
	}
}

// logPluginManifests reads each discovered plugin's dist/manifest.json (if
// present — older published packages predate the devkit change that emits
// it) and logs the platform capabilities it requires/benefits from and its
// kb.config.json section. Purely informational at this stage: it doesn't
// gate install, validate secrets, or write config — that's follow-up work
// once a non-interactive `kb-create install --plugins=...` surface exists.
// Read-only, additive; never blocks or fails the install.
func (ins *Installer) logPluginManifests(platformDir string, plugins []scan.PluginEntry) {
	for _, p := range plugins {
		if p.ResolvedPath == "" {
			continue
		}
		// p.ResolvedPath is relative to platformDir (see scanner.js's
		// `relPath = './' + path.relative(platformDir, pkgRoot)`), not to
		// this process's cwd — joining it bare resolved against whatever
		// directory kb-create happened to be invoked from, so this silently
		// found nothing whenever cwd != platformDir (the common case: a user
		// runs `kb-create install --platform ~/kb-platform` from their
		// project directory, not from inside the platform dir itself).
		manifestPath := filepath.Join(platformDir, p.ResolvedPath, "dist", "manifest.json")
		pluginManifest, err := devservices.LoadPluginManifest(manifestPath)
		if err != nil {
			continue // no static manifest yet, or not a plugin schema — silently skip
		}
		ins.Log.Printf("  plugin %s: requires=%v optional=%v configSection=%q",
			pluginManifest.ID, pluginManifest.Platform.Requires, pluginManifest.Platform.Optional, pluginManifest.ConfigSection)
	}
}

// symlinkCLI creates a platform-appropriate launcher for the KB CLI.
// On Unix: shell script at ~/.local/bin/kb
// On Windows: batch file at %LOCALAPPDATA%\kb-labs\bin\kb.cmd.
func (ins *Installer) symlinkCLI(platformDir string) {
	binJS := filepath.Join(platformDir, "node_modules", "@kb-labs", "cli-bin", "dist", "bin.js")
	if _, err := os.Stat(binJS); err != nil {
		ins.Log.Printf("  [WARN] kb bin.js not found at %s", binJS)
		return
	}

	binDir, err := platform.UserBinDir()
	if err != nil {
		ins.Log.Printf("  [WARN] resolve bin dir: %v", err)
		return
	}

	res, err := platform.WriteCLIWrapper(binDir, binJS)
	if err != nil {
		ins.Log.Printf("  [WARN] write kb wrapper: %v", err)
		return
	}
	ins.Log.Printf("  %s → %s", binJS, res.Path)
	if res.Replaced {
		ins.Log.Printf("  [WARN] replaced existing kb wrapper (was pointing at %s)", res.PreviousTarget)
	}

	result := platform.EnsureInPATH(binDir)
	switch {
	case result.AlreadySet:
		// nothing to report
	case result.NeedRestart && result.HintCmd != "":
		ins.Log.Printf("  [PATH] Run to activate: %s", result.HintCmd)
	}
	if repaired, repairErr := platform.RepairLegacyKBAliases(); repairErr != nil {
		ins.Log.Printf("  [WARN] repair legacy kb shell aliases: %v", repairErr)
	} else {
		for _, path := range repaired {
			ins.Log.Printf("  [SHELL] removed legacy kb alias from %s", path)
		}
	}
}

// installBinaries downloads Go binaries from GitHub Releases into <platformDir>/bin/
// and symlinks them into ~/.local/bin/ for PATH availability. The returned
// slice contains the names of binaries that were successfully installed
// AND also made it into the user bin dir — so callers can safely use it to
// decide which follow-up commands (e.g. "kb-dev start") to suggest.
// filterBinaries returns only the binaries whose ID is in the selected list.
// If selected is nil or empty, all binaries are returned (backwards compat).
func filterBinaries(bins []manifest.Binary, selected []string) []manifest.Binary {
	if len(selected) == 0 {
		return bins
	}
	set := make(map[string]bool, len(selected))
	for _, id := range selected {
		set[id] = true
	}
	var out []manifest.Binary
	for _, b := range bins {
		if set[b.ID] {
			out = append(out, b)
		}
	}
	return out
}

func (ins *Installer) installBinaries(platformDir string, bins []manifest.Binary) ([]string, error) {
	binDir := filepath.Join(platformDir, "bin")
	installed := make([]string, 0, len(bins))

	for _, b := range bins {
		userBinDir, err := platform.UserBinDir()
		if err != nil {
			ins.Log.Printf("  [WARN] resolve bin dir: %v", err)
			continue
		}

		// Dev mode: copy from local path instead of downloading from GitHub.
		if b.LocalPath != "" {
			ins.Log.Printf("  %s: local %s", b.Name, b.LocalPath)
			copyRes, copyErr := platform.CopyBinary(b.LocalPath, binDir, b.Name)
			if copyErr != nil {
				return installed, fmt.Errorf("binary %s (local): %w", b.Name, copyErr)
			}
			ins.Log.Printf("  %s → %s", b.LocalPath, copyRes.Path)
			copyRes2, copyErr2 := platform.CopyBinary(copyRes.Path, userBinDir, b.Name)
			if copyErr2 != nil {
				ins.Log.Printf("  [WARN] install %s → %s: %v", b.Name, userBinDir, copyErr2)
			} else {
				ins.Log.Printf("  %s → %s", copyRes.Path, copyRes2.Path)
				installed = append(installed, b.Name)
			}
			continue
		}

		// Prod mode: download from GitHub Releases.
		ch := make(chan bindown.Progress, 8)
		done := make(chan struct{})
		go func() {
			defer close(done)
			for p := range ch {
				msg := fmt.Sprintf("%s: %s", p.Binary, p.Status)
				ins.Log.Printf("  %s", msg)
				if ins.OnLine != nil {
					ins.OnLine(msg)
				}
			}
		}()

		var result *bindown.Result
		var dlErr error
		if b.Version != "" {
			result, dlErr = bindown.DownloadVersion(b.Repo, b.Name, b.Version, binDir, ch)
		} else {
			// Compatibility fallback for the embedded manifest only. Published
			// manifests pin Version and therefore never query GitHub API.
			result, dlErr = bindown.Download(b.Repo, b.Name, binDir, ch)
		}
		close(ch)
		<-done

		if dlErr != nil {
			return installed, fmt.Errorf("binary %s: %w", b.Name, dlErr)
		}

		copyRes, copyErr := platform.CopyBinary(result.Path, userBinDir, b.Name)
		if copyErr != nil {
			ins.Log.Printf("  [WARN] install %s → %s: %v", b.Name, userBinDir, copyErr)
			continue
		}
		ins.Log.Printf("  %s → %s", result.Path, copyRes.Path)
		if copyRes.Replaced {
			ins.Log.Printf("  [WARN] replaced existing %s (was pointing at %s)", b.Name, copyRes.PreviousTarget)
		}
		installed = append(installed, b.Name)
	}
	return installed, nil
}

// installGroup installs pkgs into dir, draining progress lines to the log
// and forwarding each line to OnLine if set.
// It waits for the drain goroutine to finish before returning so no output
// is lost even when the channel is buffered.
func (ins *Installer) installGroup(dir string, pkgs []string) error {
	return ins.runGroup(dir, pkgs, ins.PM.Install)
}

// updateGroup updates pkgs in dir, draining progress lines to the log.
func (ins *Installer) updateGroup(dir string, pkgs []string) error {
	if tag := os.Getenv("KB_CREATE_PACKAGE_TAG"); tag != "" {
		tagged := make([]string, len(pkgs))
		for i, pkg := range pkgs {
			tagged[i] = pkg + "@" + tag
		}
		pkgs = tagged
	}
	return ins.runGroup(dir, pkgs, ins.PM.Update)
}

// runGroup is the shared driver for installGroup / updateGroup.
func (ins *Installer) runGroup(dir string, pkgs []string, op func(string, []string, chan<- pm.Progress) error) error {
	ch := make(chan pm.Progress, 64)
	done := make(chan struct{})
	go func() {
		defer close(done)
		for p := range ch {
			if p.Line == "" {
				continue
			}
			ins.Log.Printf("  %s", p.Line)
			if ins.OnLine != nil {
				ins.OnLine(p.Line)
			}
		}
	}()
	err := op(dir, pkgs, ch)
	close(ch)
	<-done // wait for drain goroutine to flush all buffered lines
	return err
}

func (ins *Installer) selectedPkgs(components []manifest.Component, ids []string) []string {
	set := make(map[string]bool, len(ids))
	for _, id := range ids {
		set[id] = true
	}
	var out []string
	for _, c := range components {
		if set[c.ID] {
			out = append(out, c.Pkg)
		}
	}
	return out
}

// selectedPkgSpecs builds npm install specs for the catalog components whose
// ID appears in ids. versions optionally overrides the resolved version for
// a specific ID (e.g. "release" -> "0.2.0" from `--plugins=release@0.2.0`) —
// takes precedence over Component.PackageSpec()'s normal @latest/@file:path
// resolution. Dev-mode local paths (Component.LocalPath) are NOT overridden
// by a version pin — you can't pin a version of a local, unpublished build.
func (ins *Installer) selectedPkgSpecs(components []manifest.Component, ids []string, versions map[string]string) []string {
	set := make(map[string]bool, len(ids))
	for _, id := range ids {
		set[id] = true
	}
	var out []string
	for _, c := range components {
		if !set[c.ID] {
			continue
		}
		if v, ok := versions[c.ID]; ok && v != "" && c.LocalPath == "" {
			out = append(out, c.Pkg+"@"+v)
			continue
		}
		out = append(out, c.PackageSpec())
	}
	return out
}

// packLocalDirSpecs converts "name@file:/path/to/dir" specs into
// "name@file:/tmp/xxx/name-1.0.0.tgz" by running pnpm pack in each local dir.
// Specs that are already npm names or .tgz paths are left unchanged.
// The returned cleanup func removes the shared tmp dir; call it even on error.
func packLocalDirSpecs(specs []string, log *logger.Logger) (out []string, cleanup func(), err error) {
	tmpDir, mkErr := os.MkdirTemp("", "kb-dev-pack-*")
	if mkErr != nil {
		return nil, func() {}, fmt.Errorf("create tmp dir: %w", mkErr)
	}
	cleanup = func() { _ = os.RemoveAll(tmpDir) }

	out = make([]string, len(specs))
	copy(out, specs)

	for i, spec := range specs {
		name, localDir, ok := parseFileDirSpec(spec)
		if !ok {
			continue // plain npm name or already a .tgz — leave as-is
		}
		log.Printf("  pnpm pack %s", localDir)
		// #nosec G204 -- localDir is from user-provided dev-manifest; tmpDir is our own temp dir
		cmd := exec.CommandContext(context.Background(), "pnpm", "pack", "--pack-destination", tmpDir)
		cmd.Dir = localDir
		if cmdOut, cmdErr := cmd.CombinedOutput(); cmdErr != nil {
			return out, cleanup, fmt.Errorf("pnpm pack %s: %w\n%s", localDir, cmdErr, cmdOut)
		}
		tarballs, globErr := filepath.Glob(filepath.Join(tmpDir, "*.tgz"))
		if globErr != nil || len(tarballs) == 0 {
			return out, cleanup, fmt.Errorf("pnpm pack %s: no .tgz produced", localDir)
		}
		tarball := latestFile(tarballs)
		out[i] = name + "@file:" + tarball
		log.Printf("  packed  → %s", filepath.Base(tarball))
	}
	return out, cleanup, nil
}

// parseFileDirSpec extracts the package name and local directory from a spec
// like "name@file:/abs/dir". Returns ok=false for plain npm names or .tgz specs.
func parseFileDirSpec(spec string) (name, dir string, ok bool) {
	atIdx := strings.LastIndex(spec, "@file:")
	if atIdx < 0 {
		return "", "", false
	}
	p := spec[atIdx+len("@file:"):]
	if strings.HasSuffix(p, ".tgz") {
		return "", "", false
	}
	return spec[:atIdx], p, true
}

// latestFile returns the most recently modified path from the given list.
func latestFile(paths []string) string {
	best := paths[0]
	var bestTime time.Time
	for _, p := range paths {
		if info, statErr := os.Stat(p); statErr == nil && info.ModTime().After(bestTime) {
			bestTime = info.ModTime()
			best = p
		}
	}
	return best
}

// installedSet returns the set of package names that were actually installed
// based on the user's selection stored in config.
func installedSet(cfg *config.PlatformConfig) map[string]bool {
	s := make(map[string]bool)
	for _, name := range cfg.InstalledPackageNames() {
		s[name] = true
	}
	return s
}

// desiredSet returns the set of package names that should be installed
// according to the given manifest and the user's original selections.
func desiredSet(m *manifest.Manifest, selectedServices, selectedPlugins []string) map[string]bool {
	svcSet := make(map[string]bool, len(selectedServices))
	for _, id := range selectedServices {
		svcSet[id] = true
	}
	plSet := make(map[string]bool, len(selectedPlugins))
	for _, id := range selectedPlugins {
		plSet[id] = true
	}

	s := make(map[string]bool)
	for _, p := range m.Core {
		s[p.Name] = true
	}
	for _, a := range m.Adapters {
		s[a.Name] = true
	}
	for _, c := range m.Services {
		if svcSet[c.ID] {
			s[c.Pkg] = true
		}
	}
	for _, c := range m.Plugins {
		if plSet[c.ID] {
			s[c.Pkg] = true
		}
	}
	return s
}
