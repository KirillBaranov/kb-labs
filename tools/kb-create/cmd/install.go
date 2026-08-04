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
	"github.com/kb-labs/create/internal/engine/bootstrap"
	"github.com/kb-labs/create/internal/engine/direct"
	"github.com/kb-labs/create/internal/engine/executor"
	engineplan "github.com/kb-labs/create/internal/engine/plan"
	engineruntime "github.com/kb-labs/create/internal/engine/runtime"
	"github.com/kb-labs/create/internal/installer"
	"github.com/kb-labs/create/internal/logger"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/pm"
	"github.com/kb-labs/create/internal/scaffold"
	"github.com/kb-labs/create/internal/scan"
	"github.com/kb-labs/create/internal/validate"
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
	return runDeclarativeInstall(cmd)
}

func runDeclarativeInstall(cmd *cobra.Command) error {
	out := newOutput()
	plugins, pluginVersions := splitVersionedIDs(flagInstallPlugins)
	services, serviceVersions := splitVersionedIDs(flagInstallServices)
	if len(pluginVersions) > 0 || len(serviceVersions) > 0 {
		return fmt.Errorf("version-pinned components are not supported by the declarative manifest yet; update the manifest package spec instead")
	}
	adapters, err := parseAdapters(flagInstallAdapters)
	if err != nil {
		return fmt.Errorf("--adapters: %w", err)
	}
	if len(pluginVersions) != 0 || len(serviceVersions) != 0 {
		return fmt.Errorf("version pins are not supported")
	}
	catalog, err := bootstrap.DefaultCatalog()
	if err != nil {
		return fmt.Errorf("load declarative catalog: %w", err)
	}
	platformDir := flagInstallPlatform
	if platformDir == "" {
		if current, readErr := config.Read("."); readErr == nil {
			platformDir = current.Platform
		} else {
			home, _ := os.UserHomeDir()
			platformDir = filepath.Join(home, "kb-platform")
		}
	}
	platformDir, err = filepath.Abs(platformDir)
	if err != nil {
		return fmt.Errorf("resolve platform directory: %w", err)
	}
	projectDir, err := os.Getwd()
	if err != nil {
		return err
	}
	if current, readErr := config.Read(platformDir); readErr == nil {
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
		if current.CWD != "" {
			projectDir = current.CWD
		}
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
	request, err := direct.Build(direct.Input{
		Plugins:       &canonicalPlugins,
		Services:      &canonicalServices,
		Config:        configData,
		ProjectRoot:   projectDir,
		PlatformRoot:  platformDir,
		CatalogDigest: catalog.Digest,
	}, catalog)
	if err != nil {
		return fmt.Errorf("build declarative install request: %w", err)
	}
	request.Source = engineplan.SourceDirect
	compiled, err := engineplan.Compile(request, catalog)
	if err != nil {
		return fmt.Errorf("compile declarative install plan: %w", err)
	}
	if err := ensureToolchain(true, pm.Detect(pm.DetectOptions{Registry: flagInstallRegistry}).Name()); err != nil {
		return fmt.Errorf("toolchain preflight failed: %w", err)
	}
	out.Info(fmt.Sprintf("Installing %s declaratively", describeSelection(plugins, services)))
	printHumanPlanSummary(cmd.OutOrStdout(), compiled)
	journal, err := engineruntime.Apply(context.Background(), compiled, engineruntime.Options{
		PackageManager: pm.Detect(pm.DetectOptions{Registry: flagInstallRegistry}),
		JournalDir:     filepath.Join(platformDir, ".kb", "kb-create", "runs"),
		LockPath:       filepath.Join(platformDir, ".kb", "kb-create", "locks", "install.lock"),
		Rollback:       true,
	})
	if err != nil {
		return fmt.Errorf("declarative installation failed: %w", err)
	}
	declarativeManifest, err := manifest.LoadDefault()
	if err != nil {
		return fmt.Errorf("load declarative manifest: %w", err)
	}
	log, err := logger.NewFileOnly(platformDir)
	if err != nil {
		return fmt.Errorf("create declarative install log: %w", err)
	}
	selectedPlugins := make([]string, 0, len(canonicalPlugins))
	selectedServices := make([]string, 0, len(canonicalServices))
	for _, component := range append(append([]string(nil), canonicalPlugins...), canonicalServices...) {
		kind, id := manifestComponent(component)
		switch kind {
		case "plugin":
			selectedPlugins = append(selectedPlugins, id)
		case "service":
			selectedServices = append(selectedServices, id)
		}
	}
	result, finalizeErr := (&installer.Installer{PM: pm.Detect(pm.DetectOptions{Registry: flagInstallRegistry}), Log: log}).FinalizeDeclarative(&installer.Selection{
		PlatformDir:                      platformDir,
		ProjectCWD:                       projectDir,
		Plugins:                          selectedPlugins,
		Services:                         selectedServices,
		Adapters:                         adapters,
		AllowIncompatibleLegacyMigration: true,
	}, declarativeManifest)
	_ = log.Close()
	if finalizeErr != nil {
		return fmt.Errorf("finalize declarative installation: %w", finalizeErr)
	}
	printAdapterReconciliation(out, platformDir, adapters, result.InstalledPlugins)
	printEnvHints(out, platformDir, result.InstalledPlugins)
	if err := writeDeclarativeInstallState(compiled); err != nil {
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
