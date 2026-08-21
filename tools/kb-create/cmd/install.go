package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/spf13/cobra"

	"github.com/kb-labs/create/internal/config"
	"github.com/kb-labs/create/internal/devservices"
	enginecatalog "github.com/kb-labs/create/internal/engine/catalog"
	"github.com/kb-labs/create/internal/engine/direct"
	"github.com/kb-labs/create/internal/engine/executor"
	engineplan "github.com/kb-labs/create/internal/engine/plan"
	engineruntime "github.com/kb-labs/create/internal/engine/runtime"
	"github.com/kb-labs/create/internal/logger"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/pm"
	"github.com/kb-labs/create/internal/scaffold"
	"github.com/kb-labs/create/internal/scan"
	"github.com/kb-labs/create/internal/validate"
)

var (
	flagInstallPlugins         string
	flagInstallServices        string
	flagInstallAdapters        string
	flagInstallPlatform        string
	flagInstallProjectRoot     string
	flagInstallRegistry        string
	flagInstallDevManifest     string
	flagInstallSDKVersion      string
	flagInstallSDKChannel      string
	flagInstallPlatformVersion string
	flagInstallPlatformChannel string
	flagInstallForceCompat     bool
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
	installCmd.Flags().StringVar(&flagInstallProjectRoot, "project-root", "", "project directory to install into (defaults to the project used by the last install for this platform, or the current directory)")
	installCmd.Flags().StringVar(&flagInstallRegistry, "registry", "", "npm registry URL (e.g. http://localhost:4873 for local verdaccio)")
	installCmd.Flags().StringVar(&flagInstallDevManifest, "dev-manifest", "", "path to dev manifest JSON (installs from local file: paths instead of npm registry)")
	installCmd.Flags().StringVar(&flagInstallSDKVersion, "sdk-version", "", "pin the SDK (@kb-labs/sdk) to an exact version — mutually exclusive with --sdk-channel")
	installCmd.Flags().StringVar(&flagInstallSDKChannel, "sdk-channel", "", `track a release channel for the SDK: "stable" (default) or "canary"`)
	installCmd.Flags().StringVar(&flagInstallPlatformVersion, "platform-version", "", "pin core+adapters+every service+every plugin to an exact version, all identical — mutually exclusive with --platform-channel")
	installCmd.Flags().StringVar(&flagInstallPlatformChannel, "platform-channel", "", `track a release channel for core+adapters+every service+every plugin: "stable" (default) or "canary"`)
	installCmd.Flags().BoolVar(&flagInstallForceCompat, "force-compat", false, "install even if the resolved SDK/Platform versions violate the release's compatibility matrix")
	rootCmd.AddCommand(installCmd)
}

func runInstall(cmd *cobra.Command, args []string) error {
	return runDeclarativeInstall(cmd)
}

func runDeclarativeInstall(cmd *cobra.Command) error {
	out := newOutput()
	plugins, pluginVersions := splitVersionedIDs(flagInstallPlugins)
	services, serviceVersions := splitVersionedIDs(flagInstallServices)
	adapters, err := parseAdapters(flagInstallAdapters)
	if err != nil {
		return fmt.Errorf("--adapters: %w", err)
	}
	manifestSource, err := manifest.Load(manifest.LoadOptions{LocalOverride: flagInstallDevManifest})
	if err != nil {
		return fmt.Errorf("load declarative manifest: %w", err)
	}
	platformDir, err := resolvePlatformRoot(flagInstallPlatform)
	if err != nil {
		return fmt.Errorf("resolve platform directory: %w", err)
	}
	var current *config.PlatformConfig
	if saved, readErr := config.Read(platformDir); readErr == nil {
		current = saved
	}
	axes, err := resolveAxisFlags(flagInstallSDKVersion, flagInstallSDKChannel, flagInstallPlatformVersion, flagInstallPlatformChannel)
	if err != nil {
		return err
	}
	if current != nil {
		if flagInstallSDKVersion == "" && flagInstallSDKChannel == "" {
			axes.SDK = persistedInstallAxis(current.Source.SDKChannel, current.Source.SDKVersion)
		}
		if flagInstallPlatformVersion == "" && flagInstallPlatformChannel == "" {
			axes.Platform = persistedInstallAxis(current.Source.PlatformChannel, current.Source.PlatformVersion)
		}
	}
	manager := pm.Detect(pm.DetectOptions{Registry: flagInstallRegistry})
	if err := ensureToolchain(true, manager.Name()); err != nil {
		return fmt.Errorf("toolchain preflight failed: %w", err)
	}
	if err := preflightCompatibility(&axes, manifestSource, manager, flagInstallForceCompat, out); err != nil {
		return err
	}
	platformOverrides := manifest.ApplyAxisResolution(manifestSource, axes)
	manager = pm.Detect(pm.DetectOptions{
		Registry:         flagInstallRegistry,
		PackageOverrides: manifest.PackageManagerOverrides(axes),
	})
	catalog, err := enginecatalog.FromManifest(*manifestSource)
	if err != nil {
		return fmt.Errorf("compile declarative catalog: %w", err)
	}
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}
	persistedCWD := ""
	if current != nil {
		if flagInstallPlugins == "" {
			plugins = append([]string(nil), current.SelectedPlugins...)
		} else {
			plugins = mergeIDs(current.SelectedPlugins, plugins)
		}
		if flagInstallServices == "" {
			services = append([]string(nil), current.SelectedServices...)
		} else {
			services = mergeIDs(current.SelectedServices, services)
		}
		persistedCWD = current.CWD
	}
	projectDir, err := resolveProjectDir(flagInstallProjectRoot, persistedCWD, cwd)
	if err != nil {
		return fmt.Errorf("resolve project directory: %w", err)
	}
	configData, err := json.Marshal(direct.Config{Adapters: adapters})
	if err != nil {
		return err
	}
	canonicalPlugins := make([]string, 0, len(plugins))
	for _, id := range plugins {
		canonical := "plugin:" + id
		if _, ok := catalog.Component(canonical); !ok {
			return fmt.Errorf("unknown plugin %q", id)
		}
		canonicalPlugins = append(canonicalPlugins, canonical)
	}
	canonicalServices := make([]string, 0, len(services))
	for _, id := range services {
		canonical := "service:" + id
		if _, ok := catalog.Component(canonical); !ok {
			return fmt.Errorf("unknown service %q", id)
		}
		canonicalServices = append(canonicalServices, canonical)
	}
	packageOverrides := make(map[string]string, len(platformOverrides)+len(pluginVersions)+len(serviceVersions))
	for id, spec := range platformOverrides {
		packageOverrides[id] = spec
	}
	// Per-ID --plugins/--services id@version pins are applied after the
	// blanket Platform-axis spec, so an explicit per-component pin still
	// wins for that one component.
	for id, version := range pluginVersions {
		packageOverrides["plugin:"+id] = componentPackageSpec(catalog, "plugin:"+id, version)
	}
	for id, version := range serviceVersions {
		packageOverrides["service:"+id] = componentPackageSpec(catalog, "service:"+id, version)
	}
	request, err := direct.Build(direct.Input{
		Plugins:          &canonicalPlugins,
		Services:         &canonicalServices,
		Config:           configData,
		ProjectRoot:      projectDir,
		PlatformRoot:     platformDir,
		CatalogDigest:    catalog.Digest,
		Binaries:         defaultBinaryIDs(manifestSource),
		PackageOverrides: packageOverrides,
	}, catalog)
	if err != nil {
		return fmt.Errorf("build declarative install request: %w", err)
	}
	request.Source = engineplan.SourceDirect
	compiled, err := engineplan.Compile(request, catalog)
	if err != nil {
		return fmt.Errorf("compile declarative install plan: %w", err)
	}
	out.Info(fmt.Sprintf("Installing %s declaratively", describeSelection(plugins, services)))
	printHumanPlanSummary(cmd.OutOrStdout(), compiled)
	log, err := logger.NewFileOnly(platformDir)
	if err != nil {
		return fmt.Errorf("create declarative install log: %w", err)
	}
	rememberRunLog(log)
	defer func() { _ = log.Close() }()
	bootstrapEmail := bootstrapEmailForPlan(nil, false)
	bootstrapPassword := bootstrapPasswordForPlan(nil, false)
	bootstrapTenant := bootstrapTenantForPlan(nil, false)
	materializer := &declarativeMaterializer{manager: manager, log: log, source: manifestSource, bootstrapEmail: bootstrapEmail, bootstrapTenant: bootstrapTenant, bootstrapPass: bootstrapPassword}
	journal, err := engineruntime.Apply(context.Background(), compiled, engineruntime.Options{
		PackageManager: manager,
		JournalDir:     filepath.Join(platformDir, ".kb", "kb-create", "runs"),
		LockPath:       filepath.Join(platformDir, ".kb", "kb-create", "locks", "install.lock"),
		Rollback:       true,
		Progress:       logPackageManagerProgress(log),
		Emit:           installationProgress(cmd.OutOrStdout(), compiled),
		Materializer:   materializer,
	})
	if err != nil {
		return fmt.Errorf("declarative installation failed: %w", err)
	}
	if bootstrapEmail != "" {
		printBootstrapAdminCredentials(bootstrapEmail, bootstrapPassword)
	}
	if materializer.result != nil {
		printAdapterReconciliation(out, platformDir, adapters, materializer.result.InstalledPlugins)
		printEnvHints(out, platformDir, materializer.result.InstalledPlugins)
	}
	if err := writeDeclarativeInstallState(compiled, manifestSource, axes); err != nil {
		return fmt.Errorf("write declarative install state: %w", err)
	}
	completed := 0
	for _, entry := range journal.Entries {
		if entry.Status == executor.StatusCompleted {
			completed++
		}
	}
	out.OK(fmt.Sprintf("Installed declaratively (%d actions)", completed))
	return nil

}

// persistedInstallAxis restores the concrete version behind a previously
// selected channel without turning it into an exact pin. This keeps both the
// channel intent and the resolved package-manager override stable across a
// follow-up `install --plugins/--services` invocation.
func persistedInstallAxis(channel, version string) manifest.AxisSelection {
	if channel != "" {
		return manifest.AxisSelection{Channel: manifest.AxisChannel(channel), Resolved: version}
	}
	return manifest.AxisSelection{Version: version}
}

func defaultBinaryIDs(source *manifest.Manifest) []string {
	if source == nil {
		return nil
	}
	ids := make([]string, 0, len(source.Binaries))
	for _, binary := range source.Binaries {
		if binary.Default {
			ids = append(ids, binary.ID)
		}
	}
	sort.Strings(ids)
	return ids
}

func componentPackageSpec(source enginecatalog.Catalog, id, version string) string {
	component, ok := source.Component(id)
	if !ok {
		return ""
	}
	return component.Package + "@" + version
}

// resolveProjectDir picks the project directory a declarative install
// targets. Precedence: an explicit --project-root (or the create command's
// positional project-name argument, bridged in via flagInstallProjectRoot)
// always wins; otherwise fall back to the project directory recorded by a
// previous install against this platform; finally fall back to cwd.
//
// This must never silently default to cwd when a caller passed an explicit
// project directory — `kb-create <name> --yes --dev-manifest ...` (used by
// e2e/platform/entrypoint.sh) relies on installing into `<cwd>/<name>`, not
// cwd itself, so that its own `cd <name>` afterward succeeds.
func resolveProjectDir(explicit, persistedCWD, cwd string) (string, error) {
	if explicit != "" {
		return filepath.Abs(explicit)
	}
	if persistedCWD != "" {
		return persistedCWD, nil
	}
	if cwd == "" {
		return "", fmt.Errorf("no project directory available (no --project-root, no prior install, empty cwd)")
	}
	return cwd, nil
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
// --adapters role name is a recognized capability (using the installed
// generated list when available, with the local catalog as a fallback),
// and whether each installed plugin's declared platform.requires/optional
// roles actually have an adapter configured (scaffold defaults ∪ --adapters
// overrides). Purely informational — never fails the install, matching
// printEnvHints's existing tone. Required-but-unconfigured is flagged loudly
// because it's usually a real gap (e.g. `release` needing `cache`); optional
// is just a note.
func printAdapterReconciliation(out output, platformDir string, adapters map[string]string, plugins []scan.PluginEntry) {
	rolesPath := filepath.Join(platformDir, "node_modules", "@kb-labs", "plugin-runtime", "dist", "adapter-roles.json")
	knownRoles, rolesErr := devservices.LoadAdapterRoles(rolesPath)
	if rolesErr != nil {
		knownRoles = validate.KnownAdapterSlots()
	}
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
