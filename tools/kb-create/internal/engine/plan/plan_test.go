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
	if first.Actions[1].ID != "install:selection" || first.Actions[1].Inputs["packages"] != "@kb-labs/commit\n@kb-labs/state-broker-adapter" {
		t.Fatalf("selection batch = %#v", first.Actions[1])
	}
	if first.Actions[2].ID != "discover:services" || len(first.Actions[2].DependsOn) != 1 || first.Actions[2].DependsOn[0] != "install:selection" {
		t.Fatalf("discovery action = %#v", first.Actions[2])
	}
	config := first.Actions[3]
	if len(config.DependsOn) != 3 || config.DependsOn[0] != "bind:cache" || config.DependsOn[1] != "install:selection" || config.DependsOn[2] != "discover:services" {
		t.Fatalf("config dependencies = %#v", config)
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

func securedCatalog() catalog.Catalog {
	return catalog.Catalog{
		Digest: "catalog-v1",
		Effects: []catalog.Effect{{
			ID: "gateway.access.secured",
			Config: []engineconfig.ConfigPatch{
				{ID: "secured.auth", Scope: engineconfig.ScopePlatform, Operation: engineconfig.OperationSet, Path: "/gateway/auth/enabled", Value: []byte(`true`), Owner: "catalog:effect/gateway.access.secured"},
				{ID: "secured.bootstrap.email", Scope: engineconfig.ScopePlatform, Operation: engineconfig.OperationSet, Path: "/gateway/auth/bootstrap/adminEmail", Value: []byte(`"admin@bootstrap.local"`), Owner: "catalog:effect/gateway.access.secured"},
				{ID: "secured.bootstrap.tenant", Scope: engineconfig.ScopePlatform, Operation: engineconfig.OperationSet, Path: "/gateway/auth/bootstrap/tenantId", Value: []byte(`"default"`), Owner: "catalog:effect/gateway.access.secured"},
			},
		}, {
			ID: "gateway.access.local",
			Config: []engineconfig.ConfigPatch{
				{ID: "local.auth", Scope: engineconfig.ScopePlatform, Operation: engineconfig.OperationSet, Path: "/gateway/auth/enabled", Value: []byte(`false`), Owner: "catalog:effect/gateway.access.local"},
			},
		}},
	}
}

func patchValue(patches []engineconfig.ConfigPatch, path string) (string, bool) {
	for i := len(patches) - 1; i >= 0; i-- {
		if patches[i].Path == path {
			return string(patches[i].Value), true
		}
	}
	return "", false
}

// TestCompile_GatewayBootstrapEnvOverride guards the fix for a real gap: E2E
// fixtures (e2e/docker-compose.yml, docker-compose.auth-ci.yml) pin
// GATEWAY_BOOTSTRAP_ADMIN_EMAIL/GATEWAY_BOOTSTRAP_TENANT_ID to align the
// seeded gateway admin with what their test suites log in as. Once the
// bootstrap block is always emitted by the effect, those env vars would be
// permanently shadowed unless Compile explicitly threads them through as a
// higher-precedence patch.
func TestCompile_GatewayBootstrapEnvOverride(t *testing.T) {
	t.Setenv("GATEWAY_BOOTSTRAP_ADMIN_EMAIL", "admin@e2e.test")
	t.Setenv("GATEWAY_BOOTSTRAP_TENANT_ID", "kblabs-cloud")
	result, err := Compile(InstallRequest{Effects: []string{"gateway.access.secured"}}, securedCatalog())
	if err != nil {
		t.Fatal(err)
	}
	if email, ok := patchValue(result.Assembly.Patches, "/gateway/auth/bootstrap/adminEmail"); !ok || email != `"admin@e2e.test"` {
		t.Errorf("adminEmail override = %q, ok=%v, want env override to win", email, ok)
	}
	if tenant, ok := patchValue(result.Assembly.Patches, "/gateway/auth/bootstrap/tenantId"); !ok || tenant != `"kblabs-cloud"` {
		t.Errorf("tenantId override = %q, ok=%v, want env override to win", tenant, ok)
	}
}

// TestCompile_GatewayBootstrapEnvOverride_IgnoredWithoutSecuredEffect ensures
// a local/no-auth install never gains a stray "bootstrap" block just because
// the env vars happen to be set in the process environment (e.g. inherited
// from a CI job that also runs secured-mode tests).
func TestCompile_GatewayBootstrapEnvOverride_IgnoredWithoutSecuredEffect(t *testing.T) {
	t.Setenv("GATEWAY_BOOTSTRAP_ADMIN_EMAIL", "admin@e2e.test")
	t.Setenv("GATEWAY_BOOTSTRAP_TENANT_ID", "kblabs-cloud")
	result, err := Compile(InstallRequest{Effects: []string{"gateway.access.local"}}, securedCatalog())
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := patchValue(result.Assembly.Patches, "/gateway/auth/bootstrap/adminEmail"); ok {
		t.Errorf("local-mode install must not gain a bootstrap block from env vars, patches = %#v", result.Assembly.Patches)
	}
}

// TestCompile_ExtraPatchesWinOverEverything guards the documented precedence:
// ExtraPatches is the highest-precedence layer, applied after effects and
// after the env-var bootstrap override.
func TestCompile_ExtraPatchesWinOverEverything(t *testing.T) {
	t.Setenv("GATEWAY_BOOTSTRAP_ADMIN_EMAIL", "admin@e2e.test")
	result, err := Compile(InstallRequest{
		Effects: []string{"gateway.access.secured"},
		ExtraPatches: []engineconfig.ConfigPatch{
			{ID: "caller.override", Scope: engineconfig.ScopePlatform, Operation: engineconfig.OperationSet, Path: "/gateway/auth/bootstrap/adminEmail", Value: []byte(`"caller@example.com"`), Owner: "test"},
		},
	}, securedCatalog())
	if err != nil {
		t.Fatal(err)
	}
	if email, ok := patchValue(result.Assembly.Patches, "/gateway/auth/bootstrap/adminEmail"); !ok || email != `"caller@example.com"` {
		t.Errorf("adminEmail = %q, ok=%v, want ExtraPatches to win over both effect and env override", email, ok)
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
