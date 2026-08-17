package manifest

// AxisChannel is a release channel selector for a version axis.
type AxisChannel string

const (
	ChannelStable AxisChannel = "stable"
	ChannelCanary AxisChannel = "canary"
)

// SDKPackageName is the Core package that represents the SDK axis. It
// matches the "sdk" component name already hardcoded in
// internal/deployment/compatibility.matrix.json.
const SDKPackageName = "@kb-labs/sdk"

// PlatformRepresentativePackage is the Core package used to resolve and
// display the Platform axis's concrete version. Since every Platform-axis
// package (core+adapters+services+plugins) is released in lockstep and
// resolves to the same dist-tag/version via ApplyAxisResolution, resolving
// just this one representative is enough for status/diagnostics — no need
// to query every package individually.
const PlatformRepresentativePackage = "@kb-labs/core-runtime"

// AxisSelection is one axis's resolved intent. Exactly one of Version or
// Channel is meaningful at a time (validated at the CLI layer); Resolved is
// filled in later by a pre-flight registry lookup when only a channel was
// given, so downstream consumers (manifest mutation, persisted state,
// status display) can work with a concrete version instead of a dist-tag.
type AxisSelection struct {
	Version  string // exact pin, e.g. "1.4.2" — create/install only, never update
	Channel  AxisChannel
	Resolved string // concrete semver filled in by pre-flight resolution
}

// ResolvedAxes carries the SDK and Platform axis selections through a
// create/install/update run.
type ResolvedAxes struct {
	SDK      AxisSelection
	Platform AxisSelection
}

// DistTag maps a channel to its npm dist-tag. "stable" maps to npm's
// "latest" tag, matching the existing npmSpec() default.
func (a AxisSelection) DistTag() string {
	if a.Channel == ChannelCanary {
		return "canary"
	}
	return "latest"
}

// Spec returns the string that should be written into a Package/Component's
// Version field, so PackageSpec()'s existing precedence (LocalPath > Version
// > npmSpec) picks it up unchanged: the resolved semver when pre-flight
// produced one, else the exact pin, else the channel's dist-tag.
func (a AxisSelection) Spec() string {
	if a.Resolved != "" {
		return a.Resolved
	}
	if a.Version != "" {
		return a.Version
	}
	return a.DistTag()
}

// ApplyAxisResolution mutates m's Core/Adapters/Services/Plugins Version
// fields in place: the SDK axis touches only the @kb-labs/sdk Core entry;
// the Platform axis touches every other Core entry, every Adapters entry,
// every Services entry (including its companion CLI plugin), and every
// Plugins entry — uniformly, with the same resolved spec, never
// per-component. LocalPath (dev-mode file: install) entries are left
// untouched, matching PackageSpec()'s existing precedence.
//
// Component.PackageSpec() is never consulted by the engine catalog path for
// Services/Plugins (they're installed via bare package name plus
// plan.InstallRequest.PackageOverrides), so this also returns a
// componentID -> resolved spec map ("service:"+id / "plugin:"+id) meant to
// populate that override map.
func ApplyAxisResolution(m *Manifest, axes ResolvedAxes) map[string]string {
	overrides := make(map[string]string)

	for i := range m.Core {
		if m.Core[i].LocalPath != "" {
			continue
		}
		if m.Core[i].Name == SDKPackageName {
			m.Core[i].Version = axes.SDK.Spec()
			continue
		}
		m.Core[i].Version = axes.Platform.Spec()
	}
	for i := range m.Adapters {
		if m.Adapters[i].LocalPath != "" {
			continue
		}
		m.Adapters[i].Version = axes.Platform.Spec()
	}
	for i := range m.Services {
		if m.Services[i].LocalPath != "" {
			continue
		}
		m.Services[i].Version = axes.Platform.Spec()
		// Companion CLI plugins are separate package-manager actions. Pin
		// them too, otherwise they silently resolve to latest and can mix a
		// stable companion into a canary Platform installation.
		if m.Services[i].Plugin != "" {
			m.Services[i].PluginVersion = axes.Platform.Spec()
		}
		overrides["service:"+m.Services[i].ID] = m.Services[i].Pkg + "@" + axes.Platform.Spec()
	}
	for i := range m.Plugins {
		if m.Plugins[i].LocalPath != "" {
			continue
		}
		m.Plugins[i].Version = axes.Platform.Spec()
		overrides["plugin:"+m.Plugins[i].ID] = m.Plugins[i].Pkg + "@" + axes.Platform.Spec()
	}

	return overrides
}
