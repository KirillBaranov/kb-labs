package plan

import (
	"strings"
	"testing"

	"github.com/kb-labs/create/internal/engine/catalog"
	engineconfig "github.com/kb-labs/create/internal/engine/config"
)

func TestCompileIsDeterministicAndCarriesConfigAssembly(t *testing.T) {
	cat := catalog.Catalog{
		Digest: "catalog-v1",
		Components: []catalog.Component{{
			ID: "commit", Kind: "plugin", Package: "@kb-labs/commit", Requires: []catalog.Requirement{{Capability: "cache", Features: []string{"kv", "ttl"}}},
			Config: []engineconfig.ConfigPatch{{ID: "commit.enabled", Scope: engineconfig.ScopePlatform, Operation: engineconfig.OperationSet, Path: "/plugins/commit/enabled", Value: []byte(`true`), Owner: "plugin.commit"}},
		}},
		Providers: []catalog.Provider{{ID: "state-broker", Capability: "cache", Features: []string{"kv", "ttl"}, Package: "@kb-labs/state-broker-adapter"}},
		Outputs:   []engineconfig.ConfigOutput{{Scope: engineconfig.ScopePlatform, Path: ".kb/kb.config.jsonc", Format: engineconfig.FormatJSONC}},
	}
	first, err := Compile(InstallRequest{Source: SourceDirect, ProjectRoot: "/project", PlatformRoot: "/platform", Components: []string{"commit"}}, cat)
	if err != nil {
		t.Fatal(err)
	}
	second, err := Compile(InstallRequest{Source: SourceDirect, ProjectRoot: "/project", PlatformRoot: "/platform", Components: []string{"commit"}}, cat)
	if err != nil {
		t.Fatal(err)
	}
	if first.PlanHash == "" || first.PlanHash != second.PlanHash {
		t.Fatalf("plan hashes differ: %q %q", first.PlanHash, second.PlanHash)
	}
	if len(first.Assembly.Patches) != 4 || len(first.Assembly.Outputs) != 1 {
		t.Fatalf("assembly = %#v", first.Assembly)
	}
	if len(first.Actions) != 4 || first.Actions[len(first.Actions)-2].Kind != ActionWriteConfig || first.Actions[len(first.Actions)-1].Kind != ActionMaterialize {
		t.Fatalf("actions = %#v", first.Actions)
	}
	if first.Actions[1].ID != "install:selection" || first.Actions[1].Inputs["packages"] != "@kb-labs/commit\n@kb-labs/state-broker-adapter" {
		t.Fatalf("selection batch = %#v", first.Actions[1])
	}
	if len(first.Actions[2].DependsOn) != 2 || first.Actions[2].DependsOn[0] != "bind:cache" || first.Actions[2].DependsOn[1] != "install:selection" || len(first.Actions[3].DependsOn) != 1 || first.Actions[3].DependsOn[0] != "config:runtime" {
		t.Fatalf("config dependencies = %#v", first.Actions[2])
	}
}

func TestCompileRejectsFeatureMismatch(t *testing.T) {
	cat := catalog.Catalog{Digest: "catalog-v1", Components: []catalog.Component{{ID: "commit", Kind: "plugin", Package: "@kb-labs/commit", Requires: []catalog.Requirement{{Capability: "cache", Features: []string{"atomic"}}}}}, Providers: []catalog.Provider{{ID: "state-broker", Capability: "cache", Features: []string{"kv"}, Package: "@kb-labs/state-broker-adapter"}}}
	_, err := Compile(InstallRequest{Components: []string{"commit"}}, cat)
	if err == nil || !strings.Contains(err.Error(), "CAPABILITY_UNRESOLVED") {
		t.Fatalf("error = %v", err)
	}
}

func TestCompileInstallsServiceCompanionPackages(t *testing.T) {
	cat := catalog.Catalog{Components: []catalog.Component{{
		ID: "workflow", Kind: "service", Package: "@kb-labs/workflow-daemon",
		CompanionPackages: []string{"@kb-labs/workflow-entry"},
	}}}
	result, err := Compile(InstallRequest{Components: []string{"workflow"}}, cat)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Actions) != 3 {
		t.Fatalf("actions = %#v", result.Actions)
	}
	selection := result.Actions[0]
	if selection.ID != "install:selection" || selection.Inputs["packages"] != "@kb-labs/workflow-daemon\n@kb-labs/workflow-entry" {
		t.Fatalf("selection batch = %#v", selection)
	}
}

func TestCompileUsesPreferredCompatibleProvider(t *testing.T) {
	cat := catalog.Catalog{Components: []catalog.Component{{ID: "commit", Kind: "plugin", Package: "@kb-labs/commit", Requires: []catalog.Requirement{{Capability: "cache"}}}}, Providers: []catalog.Provider{{ID: "redis", Capability: "cache", Package: "redis"}, {ID: "state-broker", Capability: "cache", Package: "state"}}}
	result, err := Compile(InstallRequest{Components: []string{"commit"}, ProviderPreferences: map[string][]string{"cache": {"state-broker"}}}, cat)
	if err != nil {
		t.Fatal(err)
	}
	if result.Actions[0].Inputs["provider"] != "state-broker" {
		t.Fatalf("actions = %#v", result.Actions)
	}
}

func TestCompileCarriesSelectedEffectsAfterProviderConfig(t *testing.T) {
	cat := catalog.Catalog{
		Digest: "catalog-v1",
		Components: []catalog.Component{{
			ID: "commit", Kind: "plugin", Package: "commit",
			Requires: []catalog.Requirement{{Capability: "cache"}},
		}},
		Providers: []catalog.Provider{{
			ID: "state-broker", Capability: "cache", Package: "state",
			Config: []engineconfig.ConfigPatch{{
				ID: "provider.cache.option", Scope: engineconfig.ScopePlatform,
				Operation: engineconfig.OperationSet, Path: "/adapterOptions/cache/mode",
				Value: []byte(`"shared"`), Owner: "provider:state-broker",
			}},
		}},
		Effects: []catalog.Effect{{
			ID: "gateway.access.local",
			Config: []engineconfig.ConfigPatch{{
				ID: "gateway.local.auth", Scope: engineconfig.ScopePlatform,
				Operation: engineconfig.OperationSet, Path: "/gateway/auth/enabled",
				Value: []byte(`false`), Owner: "catalog:effect/gateway.access.local",
			}},
		}},
	}
	result, err := Compile(InstallRequest{Components: []string{"commit"}, Effects: []string{"gateway.access.local"}}, cat)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Assembly.Patches) != 3 {
		t.Fatalf("patch count = %d, patches = %#v", len(result.Assembly.Patches), result.Assembly.Patches)
	}
	last := result.Assembly.Patches[len(result.Assembly.Patches)-1]
	if last.ID != "gateway.local.auth" || string(last.Value) != "false" {
		t.Fatalf("last patch = %#v", last)
	}
}

func TestCompileRejectsUnknownEffect(t *testing.T) {
	_, err := Compile(InstallRequest{Effects: []string{"missing"}}, catalog.Catalog{})
	if err == nil || !strings.Contains(err.Error(), `unknown effect "missing"`) {
		t.Fatalf("error = %v", err)
	}
}

func TestCompileRejectsDuplicateEffects(t *testing.T) {
	cat := catalog.Catalog{Effects: []catalog.Effect{{ID: "local"}}}
	_, err := Compile(InstallRequest{Effects: []string{"local", "local"}}, cat)
	if err == nil || !strings.Contains(err.Error(), `duplicate effect "local"`) {
		t.Fatalf("error = %v", err)
	}
}

func TestCompileSortsEffectIDsForDeterministicPlans(t *testing.T) {
	cat := catalog.Catalog{Effects: []catalog.Effect{
		{ID: "z", Config: []engineconfig.ConfigPatch{{ID: "z.patch", Scope: engineconfig.ScopePlatform, Operation: engineconfig.OperationSet, Path: "/z", Value: []byte(`true`), Owner: "effect:z"}}},
		{ID: "a", Config: []engineconfig.ConfigPatch{{ID: "a.patch", Scope: engineconfig.ScopePlatform, Operation: engineconfig.OperationSet, Path: "/a", Value: []byte(`true`), Owner: "effect:a"}}},
	}}
	first, err := Compile(InstallRequest{Effects: []string{"z", "a"}}, cat)
	if err != nil {
		t.Fatal(err)
	}
	second, err := Compile(InstallRequest{Effects: []string{"a", "z"}}, cat)
	if err != nil {
		t.Fatal(err)
	}
	if first.PlanHash != second.PlanHash {
		t.Fatalf("effect order changed plan hash: %q != %q", first.PlanHash, second.PlanHash)
	}
}
