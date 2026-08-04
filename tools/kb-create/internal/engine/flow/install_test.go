package flow

import (
	"encoding/json"
	"testing"

	"github.com/kb-labs/create/internal/engine/catalog"
	"github.com/kb-labs/create/internal/engine/plan"
)

func TestScenarioAndDirectInputsCompileToEquivalentRequests(t *testing.T) {
	scenario := Scenario{
		Schema: "kb.scenario/2", ID: "commit",
		Install: &InstallSpec{
			Components:          []ComponentBinding{{ID: "commit"}},
			ProviderPreferences: []ProviderBinding{{Capability: "cache", Field: "cache"}},
		},
		Pages: []Page{{ID: "p", Sections: []Section{{ID: "s", Fields: []Field{{ID: "cache", Type: "select"}}}}}},
	}
	state, err := New(scenario)
	if err != nil {
		t.Fatal(err)
	}
	state.Values["cache"] = json.RawMessage(`"state-broker"`)
	scenarioRequest, err := BuildInstallRequest(scenario, state, "/project", "/platform", "catalog-v1")
	if err != nil {
		t.Fatal(err)
	}
	directRequest := plan.InstallRequest{Schema: "kb.install/1", Source: plan.SourceDirect, CatalogDigest: "catalog-v1", ProjectRoot: "/project", PlatformRoot: "/platform", Components: []string{"commit"}, ProviderPreferences: map[string][]string{"cache": {"state-broker"}}, Values: state.Values}
	scenarioRequest.Source = plan.SourceDirect // compare execution-relevant inputs only
	if scenarioRequest.Schema != directRequest.Schema || scenarioRequest.CatalogDigest != directRequest.CatalogDigest || scenarioRequest.ProjectRoot != directRequest.ProjectRoot || scenarioRequest.PlatformRoot != directRequest.PlatformRoot || len(scenarioRequest.Components) != 1 || scenarioRequest.Components[0] != directRequest.Components[0] || scenarioRequest.ProviderPreferences["cache"][0] != directRequest.ProviderPreferences["cache"][0] {
		t.Fatalf("scenario/direct requests differ: %#v / %#v", scenarioRequest, directRequest)
	}

	cat := catalog.Catalog{Digest: "catalog-v1", Components: []catalog.Component{{ID: "commit", Kind: "plugin", Package: "commit", Requires: []catalog.Requirement{{Capability: "cache"}}}}, Providers: []catalog.Provider{{ID: "state-broker", Capability: "cache", Package: "state"}}}
	scenarioPlan, err := plan.Compile(scenarioRequest, cat)
	if err != nil {
		t.Fatal(err)
	}
	directPlan, err := plan.Compile(directRequest, cat)
	if err != nil {
		t.Fatal(err)
	}
	if scenarioPlan.PlanHash != directPlan.PlanHash {
		t.Fatalf("plan hashes differ: %s / %s", scenarioPlan.PlanHash, directPlan.PlanHash)
	}
}

func TestScenarioProjectsConditionalEffectsIntoInstallRequest(t *testing.T) {
	scenario := Scenario{
		Schema: "kb.scenario/2", ID: "access",
		Install: &InstallSpec{Effects: []EffectBinding{
			{ID: "gateway.access.local", When: &Predicate{Path: "mode", Equals: json.RawMessage(`"local"`)}},
			{ID: "gateway.access.secured", When: &Predicate{Path: "mode", Equals: json.RawMessage(`"secured"`)}},
		}},
		Pages: []Page{{ID: "p", Sections: []Section{{ID: "s", Fields: []Field{{ID: "mode", Type: "choice", Required: true}}}}}},
	}
	state, err := New(scenario)
	if err != nil {
		t.Fatal(err)
	}
	state.Values["mode"] = json.RawMessage(`"local"`)
	request, err := BuildInstallRequest(scenario, state, "/project", "/platform", "catalog-v1")
	if err != nil {
		t.Fatal(err)
	}
	if len(request.Effects) != 1 || request.Effects[0] != "gateway.access.local" {
		t.Fatalf("effects = %#v", request.Effects)
	}
}
