package catalog

import (
	"testing"

	"github.com/kb-labs/create/internal/manifest"
)

func TestFromManifestKeepsJSONManifestAsComponentSource(t *testing.T) {
	source := manifest.Manifest{
		Services:      []manifest.Component{{ID: "state", Pkg: "@kb-labs/state", Default: true}},
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
}
