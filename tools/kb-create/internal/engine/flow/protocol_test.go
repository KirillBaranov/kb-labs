package flow

import (
	"encoding/json"
	"testing"
)

func TestSessionEmitsSameMachineEventsForAnswerSources(t *testing.T) {
	data := []byte(`{"schema":"kb.scenario/1","id":"commit","pages":[{"id":"p","sections":[{"id":"s","fields":[{"id":"mode","type":"select","required":true}]}]}]}`)
	scenario, err := Load(data)
	if err != nil {
		t.Fatal(err)
	}
	sink := &MemorySink{}
	session, err := NewSession(scenario, sink)
	if err != nil {
		t.Fatal(err)
	}
	if len(session.Inspect()) != 1 {
		t.Fatalf("inspect = %#v", session.Inspect())
	}
	if err := session.Apply(Answer{FieldID: "mode", Value: json.RawMessage(`"quick"`)}, SourceAgent); err != nil {
		t.Fatal(err)
	}
	if err := session.Advance(); err != nil {
		t.Fatal(err)
	}
	if !session.State.Done || len(sink.Events) != 2 {
		t.Fatalf("state/events = %#v / %#v", session.State, sink.Events)
	}
	if sink.Events[0].Source != SourceAgent || sink.Events[1].Type != EventCompleted {
		t.Fatalf("events = %#v", sink.Events)
	}
}

func TestLoadRejectsOldScenarioSchemaAndDuplicateFields(t *testing.T) {
	if _, err := Load([]byte(`{"schema":"kb.intent/legacy","id":"x","pages":[]}`)); err == nil {
		t.Fatal("legacy schema was accepted")
	}
	_, err := Load([]byte(`{"schema":"kb.scenario/1","id":"x","pages":[{"id":"p","sections":[{"id":"a","fields":[{"id":"same","type":"text"}]},{"id":"b","fields":[{"id":"same","type":"text"}]}]}]}`))
	if err == nil {
		t.Fatal("duplicate field was accepted")
	}
}
