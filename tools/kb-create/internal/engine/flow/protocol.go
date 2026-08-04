package flow

import (
	"encoding/json"
	"fmt"
)

type AnswerSource string

const (
	SourceHuman   AnswerSource = "human"
	SourceAgent   AnswerSource = "agent"
	SourceConfig  AnswerSource = "config"
	SourceDefault AnswerSource = "default"
)

type InputRequest struct {
	ScenarioID string          `json:"scenarioId"`
	PageID     string          `json:"pageId"`
	Field      Field           `json:"field"`
	Value      json.RawMessage `json:"value,omitempty"`
	Source     AnswerSource    `json:"source,omitempty"`
}

type EventType string

const (
	EventPageEntered EventType = "page.entered"
	EventInputAsked  EventType = "input.asked"
	EventInputSaved  EventType = "input.saved"
	EventError       EventType = "error"
	EventCompleted   EventType = "completed"
)

type Event struct {
	Sequence uint64        `json:"sequence"`
	Type     EventType     `json:"type"`
	Scenario string        `json:"scenarioId"`
	PageID   string        `json:"pageId,omitempty"`
	FieldID  string        `json:"fieldId,omitempty"`
	Source   AnswerSource  `json:"source,omitempty"`
	Request  *InputRequest `json:"request,omitempty"`
	Error    *FieldError   `json:"error,omitempty"`
}

type EventSink interface{ Emit(Event) error }

type Session struct {
	Scenario Scenario
	State    State
	Sequence uint64
	Sink     EventSink
}

func NewSession(scenario Scenario, sink EventSink) (Session, error) {
	state, err := New(scenario)
	if err != nil {
		return Session{}, err
	}
	return Session{Scenario: scenario, State: state, Sink: sink}, nil
}

func (s *Session) Inspect() []InputRequest {
	page := s.Scenario.Current(s.State)
	if page == nil {
		return nil
	}
	requests := make([]InputRequest, 0)
	for _, section := range page.Sections {
		for _, field := range section.Fields {
			if field.When != nil && !field.When.Evaluate(s.State.Values) {
				continue
			}
			request := InputRequest{ScenarioID: s.Scenario.ID, PageID: page.ID, Field: field}
			if value, ok := s.State.Values[field.ID]; ok {
				request.Value = append(json.RawMessage(nil), value...)
			}
			requests = append(requests, request)
		}
	}
	return requests
}

func (s *Session) Apply(answer Answer, source AnswerSource) error {
	state, err := s.Scenario.Answer(s.State, answer)
	if err != nil {
		fieldErr, ok := err.(FieldError)
		if !ok {
			return err
		}
		state.Errors = []FieldError{fieldErr}
		s.State = state
		s.emit(Event{Type: EventError, Scenario: s.Scenario.ID, FieldID: answer.FieldID, Source: source, Error: &fieldErr})
		return fieldErr
	}
	s.State = state
	s.emit(Event{Type: EventInputSaved, Scenario: s.Scenario.ID, FieldID: answer.FieldID, Source: source})
	return nil
}

func (s *Session) Advance() error {
	previous := s.Scenario.Current(s.State)
	state, err := s.Scenario.Next(s.State)
	s.State = state
	if err != nil {
		fieldErr, ok := err.(FieldError)
		if ok {
			s.emit(Event{Type: EventError, Scenario: s.Scenario.ID, PageID: pageID(previous), Error: &fieldErr})
		}
		return err
	}
	if s.State.Done {
		s.emit(Event{Type: EventCompleted, Scenario: s.Scenario.ID})
		return nil
	}
	page := s.Scenario.Current(s.State)
	s.emit(Event{Type: EventPageEntered, Scenario: s.Scenario.ID, PageID: pageID(page)})
	return nil
}

func (s *Session) Back() {
	s.State = s.Scenario.Back(s.State)
	if page := s.Scenario.Current(s.State); page != nil {
		s.emit(Event{Type: EventPageEntered, Scenario: s.Scenario.ID, PageID: page.ID})
	}
}

func (s *Session) emit(event Event) {
	s.Sequence++
	event.Sequence = s.Sequence
	if s.Sink != nil {
		_ = s.Sink.Emit(event)
	}
}

func pageID(page *Page) string {
	if page == nil {
		return ""
	}
	return page.ID
}

type MemorySink struct{ Events []Event }

func (s *MemorySink) Emit(event Event) error { s.Events = append(s.Events, event); return nil }

func Load(data []byte) (Scenario, error) {
	var scenario Scenario
	if err := json.Unmarshal(data, &scenario); err != nil {
		return Scenario{}, fmt.Errorf("decode scenario: %w", err)
	}
	if err := Validate(scenario); err != nil {
		return Scenario{}, err
	}
	return scenario, nil
}

func Validate(scenario Scenario) error {
	if scenario.Schema != "kb.scenario/2" {
		return fmt.Errorf("unsupported scenario schema %q", scenario.Schema)
	}
	if scenario.ID == "" || len(scenario.Pages) == 0 {
		return fmt.Errorf("scenario requires id and pages")
	}
	pageIDs := map[string]bool{}
	fieldIDs := map[string]bool{}
	for _, page := range scenario.Pages {
		if page.ID == "" || pageIDs[page.ID] {
			return fmt.Errorf("duplicate or empty page id %q", page.ID)
		}
		pageIDs[page.ID] = true
		for _, section := range page.Sections {
			if section.ID == "" {
				return fmt.Errorf("page %q has empty section id", page.ID)
			}
			for _, field := range section.Fields {
				if field.ID == "" || fieldIDs[field.ID] {
					return fmt.Errorf("duplicate or empty field id %q", field.ID)
				}
				fieldIDs[field.ID] = true
				if field.Type == "" {
					return fmt.Errorf("field %q has no type", field.ID)
				}
			}
		}
	}
	return nil
}
