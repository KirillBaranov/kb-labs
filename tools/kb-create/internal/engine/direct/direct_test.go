package direct

import (
	"testing"

	"github.com/kb-labs/create/internal/engine/catalog"
)

func TestBuildPrecedenceIsFlagsConfigDefaults(t *testing.T) {
	source := catalog.Catalog{Components: []catalog.Component{
		{ID: "default-plugin", Kind: "plugin", Package: "default", Default: true},
		{ID: "config-plugin", Kind: "plugin", Package: "config"},
		{ID: "flag-plugin", Kind: "plugin", Package: "flag"},
		{ID: "default-service", Kind: "service", Package: "default", Default: true},
		{ID: "config-service", Kind: "service", Package: "config"},
	}}
	config := []byte(`{"plugins":["config-plugin"],"services":["config-service"],"adapters":{"cache":"redis"}}`)
	plugins := []string{"flag-plugin"}
	request, err := Build(Input{Plugins: &plugins, Config: config, Adapters: map[string]string{"cache": "state-broker"}}, source)
	if err != nil {
		t.Fatal(err)
	}
	if len(request.Components) != 2 || request.Components[0] != "config-service" || request.Components[1] != "flag-plugin" {
		t.Fatalf("components = %#v", request.Components)
	}
	if request.ProviderPreferences["cache"][0] != "state-broker" {
		t.Fatalf("preferences = %#v", request.ProviderPreferences)
	}

	request, err = Build(Input{}, source)
	if err != nil {
		t.Fatal(err)
	}
	if len(request.Components) != 2 || request.Components[0] != "default-plugin" || request.Components[1] != "default-service" {
		t.Fatalf("defaults = %#v", request.Components)
	}
}

func TestBuildDoesNotLoadScenarios(t *testing.T) {
	request, err := Build(Input{Config: []byte(`{"plugins":["missing-scenario-id"]}`)}, catalog.Catalog{Components: []catalog.Component{{ID: "real", Kind: "plugin", Package: "pkg"}}})
	if err == nil || request.Components != nil {
		t.Fatalf("request/error = %#v / %v", request, err)
	}
}
