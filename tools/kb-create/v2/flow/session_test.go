package flow

import (
	"encoding/json"
	"testing"

	"github.com/kb-labs/create/v2/scenario"
)

type sink struct{ events []Event }

func (s *sink) Emit(event Event) error { s.events = append(s.events, event); return nil }

func testScenario() scenario.Scenario {
	return scenario.Scenario{
		Schema: scenario.Schema,
		ID:     "access",
		Pages: []scenario.Page{
			{ID: "mode", Sections: []scenario.Section{{ID: "gateway", Fields: []scenario.Field{{ID: "access.mode", Requirement: "gateway.access.mode", Type: "select", Required: true, Options: []scenario.Option{{Value: "local"}, {Value: "secured"}}}}}}},
			{ID: "credentials", When: &scenario.Predicate{Path: "access.mode", Equals: "secured"}, Sections: []scenario.Section{{ID: "auth", Fields: []scenario.Field{{ID: "auth.token", Requirement: "gateway.token", Type: "string", Required: true, Secret: true}}}}},
		},
	}
}

func TestSessionSkipsConditionalPageAndCompilesNavigation(t *testing.T) {
	definition := testScenario()
	sink := &sink{}
	session, err := New(definition, nil, sink)
	if err != nil {
		t.Fatal(err)
	}
	if got := session.Inspect(); len(got) != 1 || got[0].Field.ID != "access.mode" {
		t.Fatalf("initial inspect = %#v", got)
	}
	if err := session.Apply("access.mode", json.RawMessage(`"local"`), SourceHuman); err != nil {
		t.Fatal(err)
	}
	if err := session.Next(); err != nil {
		t.Fatal(err)
	}
	if !session.State.Done || session.Inspect() != nil {
		t.Fatalf("state = %#v", session.State)
	}
	if len(sink.events) == 0 || sink.events[len(sink.events)-1].Type != EventCompleted {
		t.Fatalf("events = %#v", sink.events)
	}
}

func TestSessionRequiresVisibleFieldsAndSupportsBack(t *testing.T) {
	definition := testScenario()
	session, err := New(definition, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := session.Next(); err == nil {
		t.Fatal("expected required field error")
	}
	if err := session.Apply("access.mode", json.RawMessage(`"secured"`), SourceHuman); err != nil {
		t.Fatal(err)
	}
	if err := session.Next(); err != nil {
		t.Fatal(err)
	}
	if len(session.Inspect()) != 1 || session.Inspect()[0].Field.ID != "auth.token" {
		t.Fatalf("inspect = %#v", session.Inspect())
	}
	session.Back()
	if session.State.Done || session.State.PageIndex != 0 {
		t.Fatalf("back state = %#v", session.State)
	}
}

func TestSessionRejectsInvalidAnswerBeforeAdvancing(t *testing.T) {
	session, err := New(testScenario(), nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := session.Apply("access.mode", json.RawMessage(`"unsafe"`), SourceHuman); err == nil {
		t.Fatal("expected option validation")
	}
}
