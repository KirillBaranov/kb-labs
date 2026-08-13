package resolve

import (
	"fmt"
	"github.com/kb-labs/create/v2/catalog"
	"github.com/kb-labs/create/v2/contracts"
	"strings"
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

func TestPlanProjectsSecretOnlyAsEnvironmentReference(t *testing.T) {
	source := catalog.Catalog{Digest: "release-digest", Channels: map[contracts.Channel]string{contracts.ChannelStable: "2.0.0"}, Platforms: []catalog.PlatformBundle{{ID: "platform", Version: "2.0.0", Package: "@kb/platform", SHA256: "platform", Profiles: map[string]contracts.ServiceGraph{"default": {Services: []contracts.Service{{ID: "gateway", Command: "serve"}}}}, Config: []catalog.ConfigRequirement{{ID: "openai.apiKey", Secret: true, Required: true, Env: "OPENAI_API_KEY", Services: []string{"gateway"}}}}}}
	plan, err := Plan(contracts.InstallRequest{PlatformRoot: "/tmp/x", SecretInputs: []string{"openai.apiKey"}}, source)
	if err != nil {
		t.Fatal(err)
	}
	if plan.ReleaseDigest != "release-digest" {
		t.Fatalf("release digest = %q", plan.ReleaseDigest)
	}
	if len(plan.ConfigPatches) != 2 || plan.ConfigPatches[1].Environment != "OPENAI_API_KEY" {
		t.Fatalf("patches = %#v", plan.ConfigPatches)
	}
	encoded := plan.ConfigPatches[1]
	if encoded.Value != "" || encoded.JSON != "" || strings.Contains(fmt.Sprint(plan), "OPENAI_API_KEY=") {
		t.Fatalf("secret escaped plan: %#v", plan)
	}
}

func TestPlanPreservesScenarioProvenance(t *testing.T) {
	source := catalog.Catalog{Digest: "release", Channels: map[contracts.Channel]string{contracts.ChannelStable: "2.0.0"}, Platforms: []catalog.PlatformBundle{{ID: "platform", Version: "2.0.0", Package: "@kb/platform", SHA256: "platform", Profiles: map[string]contracts.ServiceGraph{"default": {}}}}}
	plan, err := Plan(contracts.InstallRequest{PlatformRoot: "/tmp/x", ScenarioID: "custom", ScenarioStateDigest: "state"}, source)
	if err != nil || plan.ReleaseDigest != "release" || plan.ScenarioStateDigest != "state" {
		t.Fatalf("plan/error = %#v / %v", plan, err)
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
