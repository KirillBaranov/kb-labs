package manifest

import (
	"reflect"
	"testing"
)

func TestAxisSelectionSpec(t *testing.T) {
	t.Run("resolved beats version and channel", func(t *testing.T) {
		a := AxisSelection{Version: "1.0.0", Channel: ChannelCanary, Resolved: "1.2.3"}
		if got := a.Spec(); got != "1.2.3" {
			t.Errorf("Spec() = %q, want %q", got, "1.2.3")
		}
	})
	t.Run("exact version beats channel", func(t *testing.T) {
		a := AxisSelection{Version: "1.0.0", Channel: ChannelCanary}
		if got := a.Spec(); got != "1.0.0" {
			t.Errorf("Spec() = %q, want %q", got, "1.0.0")
		}
	})
	t.Run("stable channel maps to latest dist-tag", func(t *testing.T) {
		a := AxisSelection{Channel: ChannelStable}
		if got := a.Spec(); got != "latest" {
			t.Errorf("Spec() = %q, want %q", got, "latest")
		}
	})
	t.Run("canary channel maps to canary dist-tag", func(t *testing.T) {
		a := AxisSelection{Channel: ChannelCanary}
		if got := a.Spec(); got != "canary" {
			t.Errorf("Spec() = %q, want %q", got, "canary")
		}
	})
	t.Run("zero value defaults to latest", func(t *testing.T) {
		a := AxisSelection{}
		if got := a.Spec(); got != "latest" {
			t.Errorf("Spec() = %q, want %q", got, "latest")
		}
	})
}

func TestApplyAxisResolutionSDKOnlyTouchesSDKEntry(t *testing.T) {
	m := &Manifest{
		Core: []Package{
			{Name: SDKPackageName},
			{Name: "@kb-labs/core-runtime"},
		},
	}
	axes := ResolvedAxes{
		SDK:      AxisSelection{Version: "1.2.3"},
		Platform: AxisSelection{Version: "9.9.9"},
	}
	ApplyAxisResolution(m, axes)
	if m.Core[0].Version != "1.2.3" {
		t.Errorf("sdk entry Version = %q, want %q", m.Core[0].Version, "1.2.3")
	}
	if m.Core[1].Version != "9.9.9" {
		t.Errorf("non-sdk core entry Version = %q, want %q", m.Core[1].Version, "9.9.9")
	}
}

func TestApplyAxisResolutionPlatformTouchesEveryOtherEntryUniformly(t *testing.T) {
	m := &Manifest{
		Core: []Package{
			{Name: SDKPackageName},
			{Name: "@kb-labs/core-runtime"},
			{Name: "@kb-labs/cli-bin"},
		},
		Adapters: []Package{
			{Name: "@kb-labs/adapters-redis"},
		},
		Services: []Component{
			{ID: "gateway", Pkg: "@kb-labs/gateway-app"},
			{ID: "workflow", Pkg: "@kb-labs/workflow-daemon", Plugin: "@kb-labs/workflow-entry"},
		},
		Plugins: []Component{
			{ID: "commit", Pkg: "@kb-labs/commit-entry"},
		},
	}
	axes := ResolvedAxes{
		SDK:      AxisSelection{Version: "1.0.0"},
		Platform: AxisSelection{Version: "2.117.0"},
	}
	overrides := ApplyAxisResolution(m, axes)

	for _, got := range []string{m.Core[1].Version, m.Core[2].Version, m.Adapters[0].Version, m.Services[0].Version, m.Services[1].Version, m.Plugins[0].Version} {
		if got != "2.117.0" {
			t.Errorf("expected uniform platform spec 2.117.0, got %q", got)
		}
	}

	want := map[string]string{
		"service:gateway":  "@kb-labs/gateway-app@2.117.0",
		"service:workflow": "@kb-labs/workflow-daemon@2.117.0",
		"plugin:commit":    "@kb-labs/commit-entry@2.117.0",
	}
	if !reflect.DeepEqual(overrides, want) {
		t.Errorf("overrides = %#v, want %#v", overrides, want)
	}
	if got := m.Services[1].PluginVersion; got != "2.117.0" {
		t.Errorf("companion plugin version = %q, want %q", got, "2.117.0")
	}
}

func TestApplyAxisResolutionSkipsLocalPathEntries(t *testing.T) {
	m := &Manifest{
		Core: []Package{
			{Name: SDKPackageName, LocalPath: "/workspace/sdk"},
			{Name: "@kb-labs/core-runtime", LocalPath: "/workspace/core-runtime"},
		},
		Services: []Component{
			{ID: "gateway", Pkg: "@kb-labs/gateway-app", LocalPath: "/workspace/gateway"},
		},
	}
	axes := ResolvedAxes{
		SDK:      AxisSelection{Version: "1.0.0"},
		Platform: AxisSelection{Version: "2.0.0"},
	}
	overrides := ApplyAxisResolution(m, axes)

	if m.Core[0].Version != "" || m.Core[1].Version != "" {
		t.Errorf("LocalPath entries must not be mutated, got Core = %+v", m.Core)
	}
	if m.Services[0].Version != "" {
		t.Errorf("LocalPath service must not be mutated, got %+v", m.Services[0])
	}
	if len(overrides) != 0 {
		t.Errorf("expected no overrides for LocalPath-only manifest, got %#v", overrides)
	}
}

func TestApplyAxisResolutionExactVersionPinTakesPrecedenceOverChannel(t *testing.T) {
	m := &Manifest{
		Core: []Package{{Name: SDKPackageName}},
	}
	axes := ResolvedAxes{
		SDK: AxisSelection{Version: "1.4.2", Channel: ChannelCanary},
	}
	ApplyAxisResolution(m, axes)
	if m.Core[0].Version != "1.4.2" {
		t.Errorf("Version = %q, want exact pin %q (not the canary channel)", m.Core[0].Version, "1.4.2")
	}
}

func TestPackageManagerOverridesFollowSelectedAxes(t *testing.T) {
	overrides := PackageManagerOverrides(ResolvedAxes{
		SDK:      AxisSelection{Version: "2.118.0-canary.1"},
		Platform: AxisSelection{Version: "2.119.0-canary.85d060ea"},
	})
	if got := overrides[SDKPackageName]; got != "2.118.0-canary.1" {
		t.Errorf("SDK override = %q, want %q", got, "2.118.0-canary.1")
	}
	for _, name := range PlatformOwnedDependencyPackages {
		if got := overrides[name]; got != "2.119.0-canary.85d060ea" {
			t.Errorf("platform override %s = %q, want canary pin", name, got)
		}
	}
}

func TestPackageManagerOverridesOmitUnsetAxes(t *testing.T) {
	if got := PackageManagerOverrides(ResolvedAxes{Platform: AxisSelection{Resolved: "2.117.0"}}); len(got) != 0 {
		t.Fatalf("overrides for unset axes = %#v, want empty", got)
	}
}
