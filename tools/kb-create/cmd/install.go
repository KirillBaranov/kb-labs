package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/spf13/cobra"

	"github.com/kb-labs/create/internal/config"
	"github.com/kb-labs/create/internal/devservices"
	"github.com/kb-labs/create/internal/installer"
	"github.com/kb-labs/create/internal/logger"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/pm"
	"github.com/kb-labs/create/internal/scaffold"
	"github.com/kb-labs/create/internal/scan"
	"github.com/kb-labs/create/internal/wizard"
)

var (
	flagInstallPlugins     string
	flagInstallServices    string
	flagInstallAdapters    string
	flagInstallPlatform    string
	flagInstallRegistry    string
	flagInstallDevManifest string
)

var installCmd = &cobra.Command{
	Use:   "install",
	Short: "Install specific plugins/services non-interactively (no prompts — for CI/agents)",
	Long: `Installs exactly the plugins/services named by --plugins/--services, using
manifest defaults for everything else. Never prompts — unknown IDs fail fast
with a clear error, missing optional env vars print as hints, not failures.`,
	RunE: runInstall,
}

func init() {
	installCmd.Flags().StringVar(&flagInstallPlugins, "plugins", "", "comma-separated plugin IDs to install, each optionally pinned to a version (e.g. release@0.2.0,commit)")
	installCmd.Flags().StringVar(&flagInstallServices, "services", "", "comma-separated service IDs to install, each optionally pinned to a version (e.g. workflow,gateway@1.3.0)")
	installCmd.Flags().StringVar(&flagInstallAdapters, "adapters", "", `comma-separated "role=pkg[@version]" overrides (e.g. "cache=@kb-labs/adapters-redis@0.2.0")`)
	installCmd.Flags().StringVar(&flagInstallPlatform, "platform", "", "platform installation directory")
	installCmd.Flags().StringVar(&flagInstallRegistry, "registry", "", "npm registry URL (e.g. http://localhost:4873 for local verdaccio)")
	installCmd.Flags().StringVar(&flagInstallDevManifest, "dev-manifest", "", "path to dev manifest JSON (installs from local file: paths instead of npm registry)")
	rootCmd.AddCommand(installCmd)
}

func runInstall(cmd *cobra.Command, args []string) error {
	out := newOutput()

	m, err := manifest.Load(manifest.LoadOptions{
		LocalOverride: flagInstallDevManifest,
	})
	if err != nil {
		return fmt.Errorf("load manifest: %w", err)
	}

	plugins, pluginVersions := splitVersionedIDs(flagInstallPlugins)
	services, serviceVersions := splitVersionedIDs(flagInstallServices)

	if err := validateComponentIDs("plugin", plugins, m.Plugins); err != nil {
		return err
	}
	if err := validateComponentIDs("service", services, m.Services); err != nil {
		return err
	}

	// Syntax-only validation here — "role=pkg[@version]" shape, no duplicate
	// roles. Whether a role name is a *recognized* capability can only be
	// checked once @kb-labs/plugin-runtime is actually on disk (it's a
	// transitive dependency, not a core package installed up front), so that
	// check happens later, after install, in the reconciliation report.
	adapters, err := parseAdapters(flagInstallAdapters)
	if err != nil {
		return fmt.Errorf("--adapters: %w", err)
	}

	// Reuse the wizard's existing non-interactive defaulting (same path
	// `--yes` already takes) for platform dir / consent / telemetry, then
	// overwrite the selection with exactly what was requested on the flags.
	sel, err := wizard.Run(m, wizard.WizardOptions{
		Yes:                true,
		DefaultPlatformDir: flagInstallPlatform,
	})
	if err != nil {
		return err
	}
	// Explicit component installs are additive to an existing installation.
	// The wizard still supplies defaults for a brand-new platform, but a
	// follow-up `install --plugins X` must not silently remove prior choices.
	if previous, readErr := config.Read(sel.PlatformDir); readErr == nil {
		if flagInstallServices != "" {
			services = mergeIDs(previous.SelectedServices, services)
		} else {
			services = append([]string(nil), previous.SelectedServices...)
		}
		if flagInstallPlugins != "" {
			plugins = mergeIDs(previous.SelectedPlugins, plugins)
		} else {
			plugins = append([]string(nil), previous.SelectedPlugins...)
		}
	}
	sel.Services = services
	sel.Plugins = plugins
	sel.Adapters = adapters
	sel.ServiceVersions = serviceVersions
	sel.PluginVersions = pluginVersions
	sel.DevMode = flagInstallDevManifest != ""
	sel.Registry = flagInstallRegistry

	if err := os.MkdirAll(sel.PlatformDir, 0o750); err != nil {
		return fmt.Errorf("create platform dir: %w", err)
	}

	log, err := logger.New(sel.PlatformDir)
	if err != nil {
		return err
	}
	defer func() { _ = log.Close() }()

	packageManager := pm.Detect(pm.DetectOptions{Registry: flagInstallRegistry})
	if err := ensureToolchain(true, packageManager.Name()); err != nil {
		return fmt.Errorf("toolchain preflight failed: %w", err)
	}
	out.Info(fmt.Sprintf("Installing %s via %s", describeSelection(plugins, services), packageManager.Name()))

	ins := &installer.Installer{
		PM:      packageManager,
		Log:     log,
		Version: cmd.Root().Version,
	}

	result, err := ins.Install(sel, m)
	if err != nil {
		return fmt.Errorf("installation failed: %w", err)
	}

	scaffoldOpts := scaffold.Options{
		PlatformDir:                      sel.PlatformDir,
		Services:                         sel.Services,
		Plugins:                          sel.Plugins,
		Gateway:                          result.Gateway,
		Catalog:                          m,
		Adapters:                         adapters,
		AllowIncompatibleLegacyMigration: true, // install is explicitly non-interactive
	}
	if err := scaffold.WritePlatformConfig(sel.PlatformDir, scaffoldOpts); err != nil {
		return fmt.Errorf("scaffold platform config: %w", err)
	}
	if err := scaffold.WriteProjectConfig(sel.ProjectCWD, scaffoldOpts); err != nil {
		return fmt.Errorf("scaffold project config: %w", err)
	}

	out.OK(fmt.Sprintf("Installed in %s", result.Duration.Round(1)))
	out.KeyValue("config", result.ConfigPath)
	if result.ServicesWarning != "" {
		out.Warn(result.ServicesWarning)
	}

	printEnvHints(out, sel.PlatformDir, result.InstalledPlugins)
	printAdapterReconciliation(out, sel.PlatformDir, adapters, result.InstalledPlugins)

	return nil
}

func mergeIDs(existing, requested []string) []string {
	seen := make(map[string]struct{}, len(existing)+len(requested))
	merged := make([]string, 0, len(existing)+len(requested))
	for _, ids := range [][]string{existing, requested} {
		for _, id := range ids {
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			merged = append(merged, id)
		}
	}
	return merged
}

// printAdapterReconciliation reports on capability roles: whether an
// --adapters role name is a recognized capability (when the canonical list
// can be found — see LoadAdapterRoles's doc comment on why this is soft),
// and whether each installed plugin's declared platform.requires/optional
// roles actually have an adapter configured (scaffold defaults ∪ --adapters
// overrides). Purely informational — never fails the install, matching
// printEnvHints's existing tone. Required-but-unconfigured is flagged loudly
// because it's usually a real gap (e.g. `release` needing `cache`); optional
// is just a note.
func printAdapterReconciliation(out output, platformDir string, adapters map[string]string, plugins []scan.PluginEntry) {
	rolesPath := filepath.Join(platformDir, "node_modules", "@kb-labs", "plugin-runtime", "dist", "adapter-roles.json")
	knownRoles, rolesErr := devservices.LoadAdapterRoles(rolesPath)
	if rolesErr == nil {
		knownSet := make(map[string]bool, len(knownRoles))
		for _, r := range knownRoles {
			knownSet[r] = true
		}
		unknown := make([]string, 0)
		for role := range adapters {
			if !knownSet[role] {
				unknown = append(unknown, role)
			}
		}
		sort.Strings(unknown)
		for _, role := range unknown {
			out.Warn(fmt.Sprintf("--adapters: %q is not a recognized capability role (known: %s)",
				role, strings.Join(knownRoles, ", ")))
		}
	}

	configured := make(map[string]bool, len(scaffold.DefaultAdapterRoles)+len(adapters))
	for _, r := range scaffold.DefaultAdapterRoles {
		configured[r] = true
	}
	for role := range adapters {
		configured[role] = true
	}

	for _, p := range plugins {
		if p.ResolvedPath == "" {
			continue
		}
		// p.ResolvedPath is relative to platformDir (see scanner.js), not to
		// this process's cwd — must be joined against platformDir, the same
		// fix as printEnvHints below and installer.logPluginManifests.
		manifestPath := filepath.Join(platformDir, p.ResolvedPath, "dist", "manifest.json")
		pluginManifest, err := devservices.LoadPluginManifest(manifestPath)
		if err != nil {
			continue
		}
		for _, role := range pluginManifest.Platform.Requires {
			if !configured[role] {
				out.Warn(fmt.Sprintf(`%s: requires capability %q but no adapter is configured — pass --adapters "%s=<package>" to set one`,
					pluginManifest.ID, role, role))
			}
		}
		for _, role := range pluginManifest.Platform.Optional {
			if !configured[role] {
				out.Info(fmt.Sprintf("%s: optional capability %q is not configured (only needed for the features that use it)",
					pluginManifest.ID, role))
			}
		}
	}
}

// validateComponentIDs fails fast (before any install/network action) when a
// flag-supplied ID isn't in the manifest catalog, listing what IS available
// so the error is actionable rather than a bare "not found".
func validateComponentIDs(kind string, requested []string, known []manifest.Component) error {
	if len(requested) == 0 {
		return nil
	}
	knownIDs := make(map[string]bool, len(known))
	available := make([]string, 0, len(known))
	for _, c := range known {
		knownIDs[c.ID] = true
		available = append(available, c.ID)
	}
	sort.Strings(available)
	for _, id := range requested {
		if !knownIDs[id] {
			return fmt.Errorf("unknown %s %q — available: %s", kind, id, strings.Join(available, ", "))
		}
	}
	return nil
}

// printEnvHints reads each installed plugin's static manifest (already
// emitted at build time by the devkit tsup preset — see infra/devkit/tsup/node.js)
// and prints which of its declared env vars aren't currently set. Purely
// informational: these are hints for the operator, not install failures —
// there's no per-plugin config-provisioning step yet to validate against.
func printEnvHints(out output, platformDir string, plugins []scan.PluginEntry) {
	for _, p := range plugins {
		if p.ResolvedPath == "" {
			continue
		}
		// See the identical fix + comment in printAdapterReconciliation.
		manifestPath := filepath.Join(platformDir, p.ResolvedPath, "dist", "manifest.json")
		pluginManifest, err := devservices.LoadPluginManifest(manifestPath)
		if err != nil {
			continue // no static manifest yet, or not a plugin schema
		}
		var unset []string
		for _, envVar := range pluginManifest.Permissions.Env.Read {
			if strings.ContainsAny(envVar, "*") {
				continue // wildcard allow-patterns (e.g. "CI_*") aren't checkable directly
			}
			if os.Getenv(envVar) == "" {
				unset = append(unset, envVar)
			}
		}
		if len(unset) > 0 {
			out.Warn(fmt.Sprintf("%s: env not set — %s (only needed for the commands that use them)",
				pluginManifest.ID, strings.Join(unset, ", ")))
		}
	}
}

// describeSelection renders a short human summary of what was requested,
// for the single "Installing ..." status line.
func describeSelection(plugins, services []string) string {
	parts := make([]string, 0, 2)
	if len(plugins) > 0 {
		parts = append(parts, fmt.Sprintf("%d plugin(s)", len(plugins)))
	}
	if len(services) > 0 {
		parts = append(parts, fmt.Sprintf("%d service(s)", len(services)))
	}
	if len(parts) == 0 {
		return "0 packages"
	}
	return strings.Join(parts, ", ")
}

// splitCSV splits a comma-separated flag value, trimming whitespace and
// dropping empty entries (so "" and "a,,b" both behave sensibly).
func splitCSV(s string) []string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	raw := strings.Split(s, ",")
	out := make([]string, 0, len(raw))
	for _, r := range raw {
		if v := strings.TrimSpace(r); v != "" {
			out = append(out, v)
		}
	}
	return out
}

// splitVersionedIDs splits a comma-separated flag value the same way
// splitCSV does, additionally parsing an optional "@version" pin off each
// entry (e.g. "release@0.2.0,commit" -> ids=["release","commit"],
// versions={"release":"0.2.0"}). Catalog IDs never contain "@" themselves,
// so splitting on the first occurrence is unambiguous.
func splitVersionedIDs(s string) (ids []string, versions map[string]string) {
	for _, entry := range splitCSV(s) {
		if i := strings.Index(entry, "@"); i > 0 {
			id, ver := entry[:i], entry[i+1:]
			ids = append(ids, id)
			if versions == nil {
				versions = map[string]string{}
			}
			versions[id] = ver
			continue
		}
		ids = append(ids, entry)
	}
	return ids, versions
}
