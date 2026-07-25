package flow

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestFlowUsesOneReducerForConditionalPagesAndValidation(t *testing.T) {
	scenario := Scenario{Schema: "kb.scenario/1", ID: "commit", Pages: []Page{
		{ID: "components", Sections: []Section{{ID: "selection", Fields: []Field{{ID: "mode", Type: "select", Required: true, Options: []Option{{Value: "quick"}, {Value: "advanced"}}}}}}},
		{ID: "advanced", When: &Predicate{Path: "mode", Equals: json.RawMessage(`"advanced"`)}, Sections: []Section{{ID: "options", Fields: []Field{{ID: "cache", Type: "select", Required: true, Default: json.RawMessage(`"state-broker"`), Options: []Option{{Value: "state-broker"}, {Value: "redis"}}}}}}},
	}}
	state, err := New(scenario)
	if err != nil {
		t.Fatal(err)
	}
	state, err = scenario.Next(state)
	if err == nil || !strings.Contains(err.Error(), "REQUIRED") {
		t.Fatalf("Next() error = %v", err)
	}
	state, err = scenario.Answer(state, Answer{FieldID: "mode", Value: json.RawMessage(`"quick"`)})
	if err != nil {
		t.Fatal(err)
	}
	state, err = scenario.Next(state)
	if err != nil {
		t.Fatal(err)
	}
	if !state.Done || state.PageIndex != 0 {
		t.Fatalf("state = %#v, want done after skipped page", state)
	}
}

func TestFlowRejectsUnknownAndInvalidAnswers(t *testing.T) {
	scenario := Scenario{Schema: "kb.scenario/1", ID: "x", Pages: []Page{{ID: "p", Sections: []Section{{ID: "s", Fields: []Field{{ID: "choice", Type: "select", Options: []Option{{Value: "a"}}}}}}}}}
	state, _ := New(scenario)
	_, err := scenario.Answer(state, Answer{FieldID: "missing", Value: json.RawMessage(`"a"`)})
	if err == nil || !strings.Contains(err.Error(), "UNKNOWN_FIELD") {
		t.Fatalf("unknown error = %v", err)
	}
	_, err = scenario.Answer(state, Answer{FieldID: "choice", Value: json.RawMessage(`"b"`)})
	if err == nil || !strings.Contains(err.Error(), "INVALID_OPTION") {
		t.Fatalf("option error = %v", err)
	}
}
