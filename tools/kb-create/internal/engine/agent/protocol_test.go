package agent

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/kb-labs/create/internal/engine/catalog"
	"github.com/kb-labs/create/internal/engine/flow"
	"github.com/kb-labs/create/internal/engine/plan"
)

func TestHandleInspectIsJSONMachineProtocol(t *testing.T) {
	request := Request{Command: CommandInspect, Scenario: json.RawMessage(`{"schema":"kb.scenario/1","id":"commit","pages":[{"id":"p","sections":[{"id":"s","fields":[{"id":"mode","type":"select","required":true}]}]}]}`)}
	data, err := HandleJSON(mustJSON(t, request))
	if err != nil {
		t.Fatal(err)
	}
	var response Response
	if err := json.Unmarshal(data, &response); err != nil {
		t.Fatal(err)
	}
	if !response.OK || len(response.Requests) != 1 || response.Requests[0].Field.ID != "mode" {
		t.Fatalf("response = %#v", response)
	}
}

func TestHandlePlanUsesSharedCompilerAndStructuredError(t *testing.T) {
	request := Request{Command: CommandPlan, Install: &plan.InstallRequest{Components: []string{"missing"}}, Catalog: &catalog.Catalog{}}
	response := Handle(request)
	if response.OK || response.Error == nil || response.Error.Code != "PLAN_INVALID" {
		t.Fatalf("response = %#v", response)
	}
	if !strings.Contains(response.Error.Message, "unknown component") {
		t.Fatalf("error = %#v", response.Error)
	}

	state := &flow.State{ScenarioID: "other", Values: map[string]json.RawMessage{}}
	response = Handle(Request{Command: CommandInspect, Scenario: json.RawMessage(`{"schema":"kb.scenario/1","id":"commit","pages":[{"id":"p","sections":[]}]}`), State: state})
	if response.OK || response.Error.Code != "STATE_SCENARIO_MISMATCH" {
		t.Fatalf("response = %#v", response)
	}
}

func TestHandlePlanBuildsScenarioStateAndLoadsDefaultCatalog(t *testing.T) {
	response := Handle(Request{
		Command:  CommandPlan,
		Scenario: json.RawMessage(`{"schema":"kb.scenario/1","id":"commit","install":{"components":[{"id":"plugin:commit"}]},"pages":[{"id":"p","sections":[]}]}`),
		State:    &flow.State{ScenarioID: "commit", Values: map[string]json.RawMessage{}},
	})
	if !response.OK || response.Plan == nil {
		t.Fatalf("response = %#v", response)
	}
	if response.Plan.Source != plan.SourceScenario || len(response.Plan.Actions) == 0 {
		t.Fatalf("plan = %#v", response.Plan)
	}
}

func TestHandlePlanUsesScenarioProviderSelection(t *testing.T) {
	scenario := json.RawMessage(`{"schema":"kb.scenario/1","id":"commit","install":{"components":[{"id":"plugin:commit"}],"providerPreferences":[{"capability":"cache","field":"cache"}]},"pages":[{"id":"p","sections":[{"id":"s","fields":[{"id":"cache","type":"select","required":true,"options":[{"value":"state-broker"},{"value":"redis-cache"}]}]}]}]}`)
	catalog := &catalog.Catalog{
		Digest:     "test-catalog",
		Components: []catalog.Component{{ID: "plugin:commit", Kind: "plugin", Package: "commit", Requires: []catalog.Requirement{{Capability: "cache"}}}},
		Providers:  []catalog.Provider{{ID: "state-broker", Capability: "cache", Package: "state"}, {ID: "redis-cache", Capability: "cache", Package: "redis"}},
	}
	planFor := func(provider string) plan.InstallPlan {
		response := Handle(Request{Command: CommandPlan, Scenario: scenario, State: &flow.State{ScenarioID: "commit", Values: map[string]json.RawMessage{"cache": json.RawMessage(`"` + provider + `"`)}}, Catalog: catalog})
		if !response.OK || response.Plan == nil {
			t.Fatalf("provider %s response = %#v", provider, response)
		}
		return *response.Plan
	}
	statePlan := planFor("state-broker")
	redisPlan := planFor("redis-cache")
	if statePlan.PlanHash == redisPlan.PlanHash {
		t.Fatalf("provider selection did not change plan hash: %s", statePlan.PlanHash)
	}
	if providerFromPlan(statePlan) != "state-broker" || providerFromPlan(redisPlan) != "redis-cache" {
		t.Fatalf("providers = %q / %q", providerFromPlan(statePlan), providerFromPlan(redisPlan))
	}
	if configPatchValue(statePlan, "provider.cache") != `"state"` || configPatchValue(redisPlan, "provider.cache") != `"redis"` {
		t.Fatalf("cache config patches = %q / %q", configPatchValue(statePlan, "provider.cache"), configPatchValue(redisPlan, "provider.cache"))
	}
}

func providerFromPlan(value plan.InstallPlan) string {
	for _, action := range value.Actions {
		if action.Kind == plan.ActionBindProvider && action.Inputs["capability"] == "cache" {
			return action.Inputs["provider"]
		}
	}
	return ""
}

func configPatchValue(value plan.InstallPlan, id string) string {
	for _, patch := range value.Assembly.Patches {
		if patch.ID == id {
			return string(patch.Value)
		}
	}
	return ""
}

func TestHandleInspectAdvancesWithActionAndAnswers(t *testing.T) {
	scenario := json.RawMessage(`{"schema":"kb.scenario/1","id":"walk","pages":[{"id":"first","sections":[{"id":"s","fields":[{"id":"mode","type":"select","required":true,"options":[{"value":"quick"}]}]}]},{"id":"second","sections":[]}]}`)
	response := Handle(Request{Command: CommandInspect, Scenario: scenario, Answers: []flow.Answer{{FieldID: "mode", Value: json.RawMessage(`"quick"`)}}, Action: "next"})
	if !response.OK || response.State == nil || response.State.PageIndex != 1 || response.Screen == nil || response.Screen.ID != "second" {
		t.Fatalf("response = %#v", response)
	}
}

func TestHandleInspectReturnsStateOnValidationError(t *testing.T) {
	scenario := json.RawMessage(`{"schema":"kb.scenario/1","id":"walk","pages":[{"id":"first","sections":[{"id":"s","fields":[{"id":"mode","type":"text","required":true}]}]}]}`)
	response := Handle(Request{Command: CommandInspect, Scenario: scenario, Action: "next"})
	if response.OK || response.State == nil || response.Screen == nil || response.Error == nil || response.Error.Code != "INPUT_INVALID" {
		t.Fatalf("response = %#v", response)
	}
}

func mustJSON(t *testing.T, value any) []byte {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return data
}
