package cmd

import (
	"errors"
	"strings"
	"testing"

	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/pm"
)

var errPreflightResolverCalled = errors.New("resolver should not have been called for a pinned axis")

func TestResolveOneAxisRejectsBothVersionAndChannel(t *testing.T) {
	_, err := resolveOneAxis("sdk", "1.2.3", "canary")
	if err == nil {
		t.Fatal("expected error for --sdk-version + --sdk-channel together, got nil")
	}
	if !strings.Contains(err.Error(), "mutually exclusive") {
		t.Errorf("error = %q, want it to mention mutual exclusivity", err.Error())
	}
}

func TestResolveOneAxisRejectsInvalidChannel(t *testing.T) {
	_, err := resolveOneAxis("platform", "", "nightly")
	if err == nil {
		t.Fatal("expected error for invalid channel, got nil")
	}
}

func TestResolveOneAxisAllowsEmptyBoth(t *testing.T) {
	axis, err := resolveOneAxis("sdk", "", "")
	if err != nil {
		t.Fatalf("resolveOneAxis(empty, empty) error = %v, want nil (no explicit choice)", err)
	}
	if axis.Version != "" || axis.Channel != "" {
		t.Errorf("axis = %+v, want zero value", axis)
	}
}

func TestResolveOneAxisAcceptsValidChannel(t *testing.T) {
	axis, err := resolveOneAxis("platform", "", "canary")
	if err != nil {
		t.Fatalf("resolveOneAxis error = %v", err)
	}
	if axis.Channel != manifest.ChannelCanary {
		t.Errorf("axis.Channel = %q, want %q", axis.Channel, manifest.ChannelCanary)
	}
}

func TestResolveAxisFlagsBuildsBothAxes(t *testing.T) {
	axes, err := resolveAxisFlags("1.2.3", "", "", "canary")
	if err != nil {
		t.Fatalf("resolveAxisFlags error = %v", err)
	}
	if axes.SDK.Version != "1.2.3" {
		t.Errorf("axes.SDK.Version = %q, want %q", axes.SDK.Version, "1.2.3")
	}
	if axes.Platform.Channel != manifest.ChannelCanary {
		t.Errorf("axes.Platform.Channel = %q, want %q", axes.Platform.Channel, manifest.ChannelCanary)
	}
}

func TestStickyAxisPrecedence(t *testing.T) {
	tests := []struct {
		name       string
		flag       string
		persisted  string
		wantResult manifest.AxisChannel
	}{
		{"flag wins", "canary", "stable", manifest.ChannelCanary},
		{"persisted used when flag empty", "", "canary", manifest.ChannelCanary},
		{"defaults to stable when both empty", "", "", manifest.ChannelStable},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := stickyAxis(tt.flag, tt.persisted)
			if got.Channel != tt.wantResult {
				t.Errorf("stickyAxis(%q, %q).Channel = %q, want %q", tt.flag, tt.persisted, got.Channel, tt.wantResult)
			}
			if got.Version != "" {
				t.Errorf("stickyAxis() must never set an exact version, got %q", got.Version)
			}
		})
	}
}

// fakePackageManager is a minimal pm.PackageManager for preflight tests.
// Embedding fakeVersionResolver (or not) controls whether it also
// implements pm.VersionResolver.
type fakePackageManager struct {
	fakeVersionResolver
}

func (f *fakePackageManager) Name() string                                        { return "fake" }
func (f *fakePackageManager) RegistryURL() string                                 { return "" }
func (f *fakePackageManager) Install(string, []string, chan<- pm.Progress) error  { return nil }
func (f *fakePackageManager) Update(string, []string, chan<- pm.Progress) error   { return nil }
func (f *fakePackageManager) Restore(string, chan<- pm.Progress) error            { return nil }
func (f *fakePackageManager) ListInstalled(string) ([]pm.InstalledPackage, error) { return nil, nil }

// fakeVersionResolverlessManager implements pm.PackageManager but not
// pm.VersionResolver, to exercise the "resolver unavailable" skip path.
type fakeVersionResolverlessManager struct{}

func (f *fakeVersionResolverlessManager) Name() string        { return "fake-no-resolver" }
func (f *fakeVersionResolverlessManager) RegistryURL() string { return "" }
func (f *fakeVersionResolverlessManager) Install(string, []string, chan<- pm.Progress) error {
	return nil
}
func (f *fakeVersionResolverlessManager) Update(string, []string, chan<- pm.Progress) error {
	return nil
}
func (f *fakeVersionResolverlessManager) Restore(string, chan<- pm.Progress) error { return nil }
func (f *fakeVersionResolverlessManager) ListInstalled(string) ([]pm.InstalledPackage, error) {
	return nil, nil
}

type fakeVersionResolver struct {
	versions map[string]string // "pkg@tag" -> resolved version
	err      error
}

func (f fakeVersionResolver) ResolveVersion(pkg, tag string) (string, error) {
	if f.err != nil {
		return "", f.err
	}
	return f.versions[pkg+"@"+tag], nil
}

const testMatrixJSON = `{
	"schema": "kb.compatibility/1",
	"components": {
		"sdk": {"package": "@kb-labs/sdk"},
		"runtime": {"package": "@kb-labs/core-runtime"}
	},
	"rules": [
		{"component": "runtime", "versionRange": ">=2.117.0 <3.0.0", "requires": {"sdk": ">=2.115.0 <3.0.0"}}
	]
}`

func manifestWithMatrix(t *testing.T, matrixJSON string) *manifest.Manifest {
	t.Helper()
	return &manifest.Manifest{Compatibility: []byte(matrixJSON)}
}

func TestPreflightCompatibilitySkipsWhenNoMatrix(t *testing.T) {
	axes := manifest.ResolvedAxes{}
	m := &manifest.Manifest{} // no Compatibility field
	mgr := &fakePackageManager{}
	if err := preflightCompatibility(&axes, m, mgr, false, newOutput()); err != nil {
		t.Fatalf("preflightCompatibility() error = %v, want nil (no matrix to check)", err)
	}
}

// TestPreflightCompatibilityResolvesDisplayVersionEvenWithoutMatrix guards a
// real gap found while running this against the live npm registry: version
// resolution used to happen only as a side effect of matrix validation, so
// `status` showed a bare "canary" with no version until a compatibility
// matrix actually existed in the published manifest (which it doesn't yet).
// Diagnostics must work regardless of whether a matrix is present.
func TestPreflightCompatibilityResolvesDisplayVersionEvenWithoutMatrix(t *testing.T) {
	axes := manifest.ResolvedAxes{
		SDK:      manifest.AxisSelection{Channel: manifest.ChannelStable},
		Platform: manifest.AxisSelection{Channel: manifest.ChannelCanary},
	}
	m := &manifest.Manifest{} // no Compatibility field
	mgr := &fakePackageManager{fakeVersionResolver{versions: map[string]string{
		"@kb-labs/sdk@latest":          "2.115.3",
		"@kb-labs/core-runtime@canary": "2.118.1",
	}}}
	if err := preflightCompatibility(&axes, m, mgr, false, newOutput()); err != nil {
		t.Fatalf("preflightCompatibility() error = %v, want nil", err)
	}
	if axes.SDK.Resolved != "2.115.3" {
		t.Errorf("axes.SDK.Resolved = %q, want %q (resolved for display even without a matrix)", axes.SDK.Resolved, "2.115.3")
	}
	if axes.Platform.Resolved != "2.118.1" {
		t.Errorf("axes.Platform.Resolved = %q, want %q (resolved for display even without a matrix)", axes.Platform.Resolved, "2.118.1")
	}
}

// TestPreflightCompatibilitySkipsDisplayResolutionWhenPinned verifies an
// exact version pin never triggers a registry lookup at all.
func TestPreflightCompatibilitySkipsDisplayResolutionWhenPinned(t *testing.T) {
	axes := manifest.ResolvedAxes{
		SDK: manifest.AxisSelection{Version: "1.2.3"},
	}
	m := &manifest.Manifest{}
	// A resolver that errors on any call — if it's invoked for a pinned
	// axis, the test fails.
	mgr := &fakePackageManager{fakeVersionResolver{err: errPreflightResolverCalled}}
	if err := preflightCompatibility(&axes, m, mgr, false, newOutput()); err != nil {
		t.Fatalf("preflightCompatibility() error = %v, want nil", err)
	}
	if axes.SDK.Resolved != "" {
		t.Errorf("axes.SDK.Resolved = %q, want empty — a pinned version must not be overwritten by a registry lookup", axes.SDK.Resolved)
	}
}

func TestPreflightCompatibilityPassesOnCompatiblePair(t *testing.T) {
	axes := manifest.ResolvedAxes{
		SDK:      manifest.AxisSelection{Channel: manifest.ChannelStable},
		Platform: manifest.AxisSelection{Channel: manifest.ChannelStable},
	}
	m := manifestWithMatrix(t, testMatrixJSON)
	mgr := &fakePackageManager{fakeVersionResolver{versions: map[string]string{
		"@kb-labs/sdk@latest":          "2.115.3",
		"@kb-labs/core-runtime@latest": "2.117.0",
	}}}
	if err := preflightCompatibility(&axes, m, mgr, false, newOutput()); err != nil {
		t.Fatalf("preflightCompatibility() error = %v, want nil (versions satisfy the rule)", err)
	}
	if axes.SDK.Resolved != "2.115.3" {
		t.Errorf("axes.SDK.Resolved = %q, want %q", axes.SDK.Resolved, "2.115.3")
	}
	if axes.Platform.Resolved != "2.117.0" {
		t.Errorf("axes.Platform.Resolved = %q, want %q", axes.Platform.Resolved, "2.117.0")
	}
}

func TestPreflightCompatibilityBlocksOnViolation(t *testing.T) {
	axes := manifest.ResolvedAxes{
		SDK:      manifest.AxisSelection{Channel: manifest.ChannelStable},
		Platform: manifest.AxisSelection{Channel: manifest.ChannelStable},
	}
	m := manifestWithMatrix(t, testMatrixJSON)
	mgr := &fakePackageManager{fakeVersionResolver{versions: map[string]string{
		"@kb-labs/sdk@latest":          "2.100.0", // below the rule's required >=2.115.0
		"@kb-labs/core-runtime@latest": "2.117.0",
	}}}
	err := preflightCompatibility(&axes, m, mgr, false, newOutput())
	if err == nil {
		t.Fatal("preflightCompatibility() error = nil, want a blocking compatibility error")
	}
}

func TestPreflightCompatibilityForceDowngradesViolationToWarning(t *testing.T) {
	axes := manifest.ResolvedAxes{
		SDK:      manifest.AxisSelection{Channel: manifest.ChannelStable},
		Platform: manifest.AxisSelection{Channel: manifest.ChannelStable},
	}
	m := manifestWithMatrix(t, testMatrixJSON)
	mgr := &fakePackageManager{fakeVersionResolver{versions: map[string]string{
		"@kb-labs/sdk@latest":          "2.100.0",
		"@kb-labs/core-runtime@latest": "2.117.0",
	}}}
	if err := preflightCompatibility(&axes, m, mgr, true, newOutput()); err != nil {
		t.Fatalf("preflightCompatibility() with force=true error = %v, want nil", err)
	}
}

func TestPreflightCompatibilitySkipsWhenOffline(t *testing.T) {
	t.Setenv("KB_CREATE_OFFLINE", "1")
	axes := manifest.ResolvedAxes{}
	m := manifestWithMatrix(t, testMatrixJSON)
	mgr := &fakePackageManager{fakeVersionResolver{versions: map[string]string{}}}
	if err := preflightCompatibility(&axes, m, mgr, false, newOutput()); err != nil {
		t.Fatalf("preflightCompatibility() offline error = %v, want nil (skipped)", err)
	}
}

func TestPreflightCompatibilitySkipsWhenResolverUnavailable(t *testing.T) {
	axes := manifest.ResolvedAxes{}
	m := manifestWithMatrix(t, testMatrixJSON)
	mgr := &fakeVersionResolverlessManager{}
	if err := preflightCompatibility(&axes, m, mgr, false, newOutput()); err != nil {
		t.Fatalf("preflightCompatibility() error = %v, want nil (resolver unavailable, must not fail install)", err)
	}
}
