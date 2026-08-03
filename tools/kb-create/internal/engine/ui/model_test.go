package ui

import (
	"encoding/json"
	"testing"

	"github.com/kb-labs/create/internal/engine/flow"
)

func TestFromPageBuildsCommonScreenModelAndRedactsSecret(t *testing.T) {
	scenario := flow.Scenario{Schema: "kb.scenario/2", ID: "x", Pages: []flow.Page{{ID: "setup", Title: "Setup", Sections: []flow.Section{{ID: "main", Fields: []flow.Field{{ID: "name", Type: "text", Label: "Name"}, {ID: "token", Type: "secret", Secret: true}}}}}}}
	state, err := flow.New(scenario)
	if err != nil {
		t.Fatal(err)
	}
	state.Values["name"] = json.RawMessage(`"KB"`)
	state.Values["token"] = json.RawMessage(`"hidden"`)
	screen, err := FromPage(scenario, state)
	if err != nil {
		t.Fatal(err)
	}
	if screen.ID != "setup" || screen.Sections[0].Fields[0].Kind != ControlText {
		t.Fatalf("screen = %#v", screen)
	}
	if screen.Sections[0].Fields[1].Value != nil {
		t.Fatalf("secret leaked: %#v", screen.Sections[0].Fields[1])
	}
	if len(screen.Actions) != 2 || !screen.Actions[1].Primary {
		t.Fatalf("actions = %#v", screen.Actions)
	}
}

func TestFromPageRejectsScenarioSpecificControlTypes(t *testing.T) {
	scenario := flow.Scenario{Schema: "kb.scenario/2", ID: "x", Pages: []flow.Page{{ID: "p", Sections: []flow.Section{{ID: "s", Fields: []flow.Field{{ID: "custom", Type: "my-widget"}}}}}}}
	state, _ := flow.New(scenario)
	if _, err := FromPage(scenario, state); err == nil {
		t.Fatal("custom widget accepted")
	}
}
