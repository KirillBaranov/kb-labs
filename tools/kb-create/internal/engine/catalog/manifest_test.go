package catalog

import (
	"testing"

	engineconfig "github.com/kb-labs/create/internal/engine/config"
	"github.com/kb-labs/create/internal/manifest"
)

func TestFromManifestKeepsJSONManifestAsComponentSource(t *testing.T) {
	source := manifest.Manifest{
		Services:      []manifest.Component{{ID: "state", Pkg: "@kb-labs/state", Plugin: "@kb-labs/state-entry", Default: true}},
		Plugins:       []manifest.Component{{ID: "commit", Pkg: "@kb-labs/commit"}},
		AdapterConfig: &manifest.AdapterConfig{Adapters: map[string]string{"cache": "@kb-labs/adapters-redis"}},
	}
	result, err := FromManifest(source)
	if err != nil {
		t.Fatal(err)
	}
	if result.Digest == "" || len(result.Components) != 2 || result.Components[0].ID != "plugin:commit" || result.Components[1].ID != "service:state" {
		t.Fatalf("catalog = %#v", result)
	}
	if result.Providers[0].ID != "cache" || result.Providers[0].Package != "@kb-labs/adapters-redis" {
		t.Fatalf("providers = %#v", result.Providers)
	}
	service, ok := result.Component("service:state")
	if !ok || len(service.Config) != 1 || service.Config[0].Path != "/services/state" {
		t.Fatalf("service toggle patch = %#v, want scalar service path", service.Config)
	}
	if len(service.CompanionPackages) != 1 || service.CompanionPackages[0] != "@kb-labs/state-entry" {
		t.Fatalf("service companion packages = %#v", service.CompanionPackages)
	}
	plugin, ok := result.Component("plugin:commit")
	if !ok || len(plugin.Config) != 1 || plugin.Config[0].Path != "/plugins/commit/enabled" {
		t.Fatalf("plugin toggle patch = %#v, want object enabled path", plugin.Config)
	}
}

func TestFromManifestPinsResolvedServiceCompanionPackage(t *testing.T) {
	source := manifest.Manifest{Services: []manifest.Component{{
		ID: "workflow", Pkg: "@kb-labs/workflow", Plugin: "@kb-labs/workflow-entry", PluginVersion: "2.118.1",
	}}}
	result, err := FromManifest(source)
	if err != nil {
		t.Fatal(err)
	}
	service, ok := result.Component("service:workflow")
	if !ok || len(service.CompanionPackages) != 1 || service.CompanionPackages[0] != "@kb-labs/workflow-entry@2.118.1" {
		t.Fatalf("service companion packages = %#v", service.CompanionPackages)
	}
}

func TestFromManifestConvertsReusableEffects(t *testing.T) {
	source := manifest.Manifest{Effects: []manifest.ConfigEffect{{
		ID: "gateway.access.local",
		Config: []manifest.ConfigPatch{{
			ID:        "gateway.local.auth",
			Scope:     "platform",
			Operation: "set",
			Path:      "/gateway/auth/enabled",
			Value:     []byte("false"),
		}},
	}}}
	result, err := FromManifest(source)
	if err != nil {
		t.Fatal(err)
	}
	effect, ok := result.Effect("gateway.access.local")
	if !ok || len(effect.Config) != 1 {
		t.Fatalf("effects = %#v", result.Effects)
	}
	patch := effect.Config[0]
	if patch.Scope != engineconfig.ScopePlatform || patch.Operation != engineconfig.OperationSet || patch.Owner != "catalog:effect/gateway.access.local" {
		t.Fatalf("converted patch = %#v", patch)
	}
}

func TestCatalogRejectsDuplicateEffects(t *testing.T) {
	err := (Catalog{Effects: []Effect{{ID: "same"}, {ID: "same"}}}).Validate()
	if err == nil {
		t.Fatal("Validate() accepted duplicate effect IDs")
	}
}
