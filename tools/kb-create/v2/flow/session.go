// Package flow provides the presentation-neutral human/agent scenario session.
// It owns navigation and validation state, while scenario and the V2 resolver
// own declarative meaning and installation decisions respectively.
package flow

import (
	"encoding/json"
	"fmt"

	"github.com/kb-labs/create/v2/scenario"
)

type AnswerSource string

const (
	SourceHuman   AnswerSource = "human"
	SourceAgent   AnswerSource = "agent"
	SourceDefault AnswerSource = "default"
	SourceResume  AnswerSource = "resume"
)

type InputRequest struct {
	ScenarioID string          `json:"scenarioId"`
	PageID     string          `json:"pageId"`
	Field      scenario.Field  `json:"field"`
	Value      json.RawMessage `json:"value,omitempty"`
	Source     AnswerSource    `json:"source,omitempty"`
}

type EventType string

const (
	EventPageEntered EventType = "page.entered"
	EventInputSaved  EventType = "input.saved"
	EventError       EventType = "error"
	EventCompleted   EventType = "completed"
)

type Event struct {
	Sequence uint64       `json:"sequence"`
	Type     EventType    `json:"type"`
	Scenario string       `json:"scenarioId"`
	PageID   string       `json:"pageId,omitempty"`
	FieldID  string       `json:"fieldId,omitempty"`
	Source   AnswerSource `json:"source,omitempty"`
	Error    *FieldError  `json:"error,omitempty"`
}

type FieldError struct {
	FieldID string `json:"fieldId"`
	Message string `json:"message"`
}

func (e FieldError) Error() string { return fmt.Sprintf("%s: %s", e.FieldID, e.Message) }

type EventSink interface{ Emit(Event) error }

type Session struct {
	Scenario scenario.Scenario
	State    scenario.State
	Sequence uint64
	Sink     EventSink
}

func New(s scenario.Scenario, state *scenario.State, sink EventSink) (Session, error) {
	if err := scenario.Validate(s); err != nil {
		return Session{}, err
	}
	if state == nil {
		fresh, err := scenario.New(s)
		if err != nil {
			return Session{}, err
		}
		state = &fresh
	}
	if state.ScenarioID != s.ID {
		return Session{}, fmt.Errorf("state belongs to %q, want %q", state.ScenarioID, s.ID)
	}
	return Session{Scenario: s, State: *state, Sink: sink}, nil
}

func (s *Session) Inspect() []InputRequest {
	pages := scenario.VisiblePages(s.Scenario, s.State)
	if len(pages) == 0 || s.State.Done {
		return nil
	}
	if s.State.PageIndex >= len(pages) {
		return nil
	}
	page := pages[s.State.PageIndex]
	requests := make([]InputRequest, 0)
	for _, field := range scenario.VisibleFields(page, s.State) {
		request := InputRequest{ScenarioID: s.Scenario.ID, PageID: page.ID, Field: field, Source: SourceHuman}
		if value, ok := s.State.Answers[field.ID]; ok {
			request.Value = append(json.RawMessage(nil), value...)
		}
		requests = append(requests, request)
	}
	return requests
}

func (s *Session) Apply(fieldID string, raw json.RawMessage, source AnswerSource) error {
	state, err := scenario.Answer(s.Scenario, s.State, fieldID, raw)
	if err != nil {
		s.emit(Event{Type: EventError, Scenario: s.Scenario.ID, FieldID: fieldID, Source: source, Error: &FieldError{FieldID: fieldID, Message: err.Error()}})
		return err
	}
	s.State = state
	s.emit(Event{Type: EventInputSaved, Scenario: s.Scenario.ID, FieldID: fieldID, Source: source})
	return nil
}

func (s *Session) Next() error {
	pages := scenario.VisiblePages(s.Scenario, s.State)
	if s.State.Done {
		return nil
	}
	if s.State.PageIndex >= len(pages) {
		s.State.Done = true
		return nil
	}
	for _, field := range scenario.VisibleFields(pages[s.State.PageIndex], s.State) {
		if field.Required {
			value, ok := s.State.Answers[field.ID]
			if !ok || len(value) == 0 || string(value) == "null" || string(value) == `""` {
				err := FieldError{FieldID: field.ID, Message: "required field is missing"}
				s.emit(Event{Type: EventError, Scenario: s.Scenario.ID, PageID: pages[s.State.PageIndex].ID, Error: &err})
				return err
			}
		}
	}
	s.State.PageIndex++
	if s.State.PageIndex >= len(pages) {
		s.State.Done = true
		s.emit(Event{Type: EventCompleted, Scenario: s.Scenario.ID})
		return nil
	}
	s.emit(Event{Type: EventPageEntered, Scenario: s.Scenario.ID, PageID: pages[s.State.PageIndex].ID})
	return nil
}

func (s *Session) Back() {
	if s.State.Done {
		s.State.Done = false
	}
	if s.State.PageIndex > 0 {
		s.State.PageIndex--
	}
	pages := scenario.VisiblePages(s.Scenario, s.State)
	if len(pages) > 0 && s.State.PageIndex < len(pages) {
		s.emit(Event{Type: EventPageEntered, Scenario: s.Scenario.ID, PageID: pages[s.State.PageIndex].ID})
	}
}

func (s *Session) emit(event Event) {
	s.Sequence++
	event.Sequence = s.Sequence
	if s.Sink != nil {
		_ = s.Sink.Emit(event)
	}
}
