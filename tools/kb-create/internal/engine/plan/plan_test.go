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
	if len(first.Actions) != 4 || first.Actions[len(first.Actions)-1].Kind != ActionWriteConfig {
		t.Fatalf("actions = %#v", first.Actions)
	}
	if len(first.Actions[2].DependsOn) != 2 || first.Actions[2].DependsOn[0] != "install:commit" || first.Actions[2].DependsOn[1] != "install:provider:cache" {
		t.Fatalf("provider dependencies = %#v", first.Actions[1])
	}
}

func TestCompileRejectsFeatureMismatch(t *testing.T) {
	cat := catalog.Catalog{Digest: "catalog-v1", Components: []catalog.Component{{ID: "commit", Kind: "plugin", Package: "@kb-labs/commit", Requires: []catalog.Requirement{{Capability: "cache", Features: []string{"atomic"}}}}}, Providers: []catalog.Provider{{ID: "state-broker", Capability: "cache", Features: []string{"kv"}, Package: "@kb-labs/state-broker-adapter"}}}
	_, err := Compile(InstallRequest{Components: []string{"commit"}}, cat)
	if err == nil || !strings.Contains(err.Error(), "CAPABILITY_UNRESOLVED") {
		t.Fatalf("error = %v", err)
	}
}

func TestCompileUsesPreferredCompatibleProvider(t *testing.T) {
	cat := catalog.Catalog{Components: []catalog.Component{{ID: "commit", Kind: "plugin", Package: "@kb-labs/commit", Requires: []catalog.Requirement{{Capability: "cache"}}}}, Providers: []catalog.Provider{{ID: "redis", Capability: "cache", Package: "redis"}, {ID: "state-broker", Capability: "cache", Package: "state"}}}
	result, err := Compile(InstallRequest{Components: []string{"commit"}, ProviderPreferences: map[string][]string{"cache": {"state-broker"}}}, cat)
	if err != nil {
		t.Fatal(err)
	}
	if result.Actions[2].Inputs["provider"] != "state-broker" {
		t.Fatalf("actions = %#v", result.Actions)
	}
}
