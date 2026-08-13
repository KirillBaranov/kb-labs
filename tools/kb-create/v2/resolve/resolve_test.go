package resolve

import (
	"github.com/kb-labs/create/v2/catalog"
	"github.com/kb-labs/create/v2/contracts"
	"testing"
)

func TestAmbiguousProviderFailsFast(t *testing.T) {
	source := catalog.Catalog{Channels: map[contracts.Channel]string{contracts.ChannelStable: "2.0.0"}, Platforms: []catalog.PlatformBundle{{Version: "2.0.0", Profiles: map[string]contracts.ServiceGraph{"default": {}}, Requires: []catalog.Requirement{{Capability: "logs"}}}}, Adapters: []catalog.Adapter{{Component: catalog.Component{ID: "a", Version: "1"}, Provides: []string{"logs"}}, {Component: catalog.Component{ID: "b", Version: "1"}, Provides: []string{"logs"}}}}
	_, err := Plan(contracts.InstallRequest{PlatformRoot: "/tmp/x"}, source)
	if err == nil {
		t.Fatal("expected error")
	}
	if value, ok := err.(*contracts.LauncherError); !ok || value.Code != contracts.CodeProviderAmbiguous {
		t.Fatalf("%T %#v", err, err)
	}
}

func TestPlanIncludesSDKAndResolvedAdapterArtifacts(t *testing.T) {
	source := catalog.Catalog{Channels: map[contracts.Channel]string{contracts.ChannelStable: "2.0.0"}, Platforms: []catalog.PlatformBundle{{Version: "2.0.0", SDKRange: "^2.0.0", Profiles: map[string]contracts.ServiceGraph{"default": {}}, Requires: []catalog.Requirement{{Capability: "logs"}}}}, SDKs: []catalog.Component{{ID: "sdk", Version: "2.1.0", Package: "@kb/sdk", SHA256: "sdk"}}, Adapters: []catalog.Adapter{{Component: catalog.Component{ID: "pino", Version: "1.0.0", Package: "@kb/pino", SHA256: "pino"}, Provides: []string{"logs"}}}}
	plan, err := Plan(contracts.InstallRequest{PlatformRoot: "/tmp/x", SDK: contracts.VersionSelector{Version: "2.1.0"}}, source)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]bool{}
	for _, item := range plan.Artifacts {
		got[item.Kind+":"+item.ID] = true
	}
	if !got["sdk:sdk"] || !got["adapter:pino"] {
		t.Fatalf("missing selected artifacts: %#v", plan.Artifacts)
	}
}
