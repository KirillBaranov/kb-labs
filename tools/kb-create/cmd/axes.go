package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/kb-labs/create/internal/deployment"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/pm"
)

// resolveAxisFlags validates and builds the SDK/Platform axis selections
// from the four raw CLI flag values shared by create/install. Each axis's
// --<axis>-version and --<axis>-channel are mutually exclusive.
func resolveAxisFlags(sdkVersion, sdkChannel, platformVersion, platformChannel string) (manifest.ResolvedAxes, error) {
	sdk, err := resolveOneAxis("sdk", sdkVersion, sdkChannel)
	if err != nil {
		return manifest.ResolvedAxes{}, err
	}
	platform, err := resolveOneAxis("platform", platformVersion, platformChannel)
	if err != nil {
		return manifest.ResolvedAxes{}, err
	}
	return manifest.ResolvedAxes{SDK: sdk, Platform: platform}, nil
}

func resolveOneAxis(axisName, version, channel string) (manifest.AxisSelection, error) {
	if version != "" && channel != "" {
		return manifest.AxisSelection{}, fmt.Errorf("--%s-version and --%s-channel are mutually exclusive", axisName, axisName)
	}
	if channel != "" && channel != string(manifest.ChannelStable) && channel != string(manifest.ChannelCanary) {
		return manifest.AxisSelection{}, fmt.Errorf("--%s-channel must be %q or %q, got %q", axisName, manifest.ChannelStable, manifest.ChannelCanary, channel)
	}
	return manifest.AxisSelection{Version: version, Channel: manifest.AxisChannel(channel)}, nil
}

// stickyAxis resolves an update-time channel selection: the explicit flag if
// given, else the persisted channel from a previous install/update, else
// "stable". update never accepts a version pin, so Version is always empty.
func stickyAxis(flagChannel, persistedChannel string) manifest.AxisSelection {
	channel := flagChannel
	if channel == "" {
		channel = persistedChannel
	}
	if channel == "" {
		channel = string(manifest.ChannelStable)
	}
	return manifest.AxisSelection{Channel: manifest.AxisChannel(channel)}
}

// preflightCompatibility resolves each axis's dist-tag to a concrete
// version for display/diagnostics (skipping the registry lookup entirely
// for an exact pin), fills axes.SDK.Resolved / axes.Platform.Resolved, and
// — only when the manifest carries a compatibility matrix — validates the
// resulting pair against it.
//
// It never fails an install on a network hiccup: offline mode or a
// resolver/registry that can't be reached both degrade to a warning, not
// an error, for both the display resolution and the compatibility check. A
// genuine compatibility violation is a blocking error unless force is
// true, in which case it's downgraded to a warning too.
func preflightCompatibility(axes *manifest.ResolvedAxes, m *manifest.Manifest, mgr pm.PackageManager, force bool, out output) error {
	offline := os.Getenv("KB_CREATE_OFFLINE") == "1"
	resolver, canResolve := mgr.(pm.VersionResolver)

	// Always attempt to resolve a concrete version per axis for status/
	// diagnostics display, independent of whether there's a compatibility
	// matrix to validate against — this is what makes `status` show
	// "canary (2.118.1)" instead of a bare "canary".
	if !offline && canResolve {
		resolveAxisDisplayVersion(&axes.SDK, manifest.SDKPackageName, resolver)
		resolveAxisDisplayVersion(&axes.Platform, manifest.PlatformRepresentativePackage, resolver)
	}

	if len(m.Compatibility) == 0 {
		return nil
	}
	var matrix deployment.Matrix
	if err := json.Unmarshal(m.Compatibility, &matrix); err != nil {
		out.Warn(fmt.Sprintf("compatibility matrix in manifest is invalid, skipping check: %v", err))
		return nil
	}
	if matrix.Schema != "kb.compatibility/1" || len(matrix.Components) == 0 {
		out.Warn("compatibility matrix in manifest is empty or has an unrecognized schema, skipping check")
		return nil
	}
	if offline {
		out.Warn("offline mode: skipping compatibility check")
		return nil
	}
	if !canResolve {
		out.Warn(fmt.Sprintf("%s does not support version resolution, skipping compatibility check", mgr.Name()))
		return nil
	}

	versions := make(map[string]string, len(matrix.Components))
	for id, component := range matrix.Components {
		axis := axisFor(axes, component.Package)
		version := axis.Version
		if version == "" {
			version = axis.Resolved
		}
		if version == "" {
			resolved, err := resolver.ResolveVersion(component.Package, axis.DistTag())
			if err != nil {
				out.Warn(fmt.Sprintf("could not resolve %s@%s, skipping compatibility check: %v", component.Package, axis.DistTag(), err))
				return nil
			}
			version = resolved
		}
		versions[id] = version
		setAxisResolved(axes, component.Package, version)
	}

	if err := deployment.ValidateVersions(versions, matrix); err != nil {
		if force {
			out.Warn(fmt.Sprintf("compatibility check failed (continuing due to --force-compat): %v", err))
			return nil
		}
		return fmt.Errorf("compatibility check failed: %w (use --force-compat to override)", err)
	}
	return nil
}

// resolveAxisDisplayVersion fills axis.Resolved from the registry when the
// axis is channel-tracked (an exact pin needs no lookup). Failures are silent:
// this lookup only enriches later status output and must not distract from a
// real installation error or make offline use look broken.
func resolveAxisDisplayVersion(axis *manifest.AxisSelection, pkg string, resolver pm.VersionResolver) {
	if axis.Version != "" || axis.Resolved != "" {
		return
	}
	version, err := resolver.ResolveVersion(pkg, axis.DistTag())
	if err != nil {
		return
	}
	axis.Resolved = version
}

func axisFor(axes *manifest.ResolvedAxes, pkg string) manifest.AxisSelection {
	if pkg == manifest.SDKPackageName {
		return axes.SDK
	}
	return axes.Platform
}

// normalizeChannel returns "stable" for an unset channel, so update's
// sticky read never has to special-case an empty string vs. an explicit
// "stable".
func normalizeChannel(channel string) string {
	if channel == "" {
		return string(manifest.ChannelStable)
	}
	return channel
}

// axisPersistedChannel is what gets written to InstallSource.*Channel: empty
// when an exact version pin was used (channel tracking isn't in play), else
// the normalized channel ("stable" when the axis was left at its default).
func axisPersistedChannel(a manifest.AxisSelection) string {
	if a.Version != "" {
		return ""
	}
	return normalizeChannel(string(a.Channel))
}

// axisPersistedVersion is what gets written to InstallSource.*Version: the
// pre-flight-resolved concrete semver when available, else the exact pin
// the user gave, else empty (channel-tracked, never resolved — e.g. no
// compatibility matrix was present to trigger resolution).
func axisPersistedVersion(a manifest.AxisSelection) string {
	if a.Resolved != "" {
		return a.Resolved
	}
	return a.Version
}

func setAxisResolved(axes *manifest.ResolvedAxes, pkg, version string) {
	if pkg == manifest.SDKPackageName {
		axes.SDK.Resolved = version
		return
	}
	axes.Platform.Resolved = version
}
