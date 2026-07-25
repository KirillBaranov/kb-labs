// Package flow implements the presentation-neutral scenario state machine.
// Drivers provide answers and render events; the reducer owns navigation,
// visibility, defaults, and validation.
package flow

import (
	"bytes"
	"encoding/json"
	"fmt"
	"reflect"
)

type Scenario struct {
	Schema  string       `json:"schema"`
	ID      string       `json:"id"`
	Title   string       `json:"title,omitempty"`
	Pages   []Page       `json:"pages"`
	Install *InstallSpec `json:"install,omitempty"`
}

type Page struct {
	ID       string     `json:"id"`
	Title    string     `json:"title,omitempty"`
	Sections []Section  `json:"sections,omitempty"`
	When     *Predicate `json:"when,omitempty"`
}

type Section struct {
	ID          string  `json:"id"`
	Title       string  `json:"title,omitempty"`
	Description string  `json:"description,omitempty"`
	Fields      []Field `json:"fields"`
}

type Field struct {
	ID          string          `json:"id"`
	Type        string          `json:"type"`
	Label       string          `json:"label,omitempty"`
	Description string          `json:"description,omitempty"`
	Placeholder string          `json:"placeholder,omitempty"`
	Secret      bool            `json:"secret,omitempty"`
	Required    bool            `json:"required,omitempty"`
	Default     json.RawMessage `json:"default,omitempty"`
	Options     []Option        `json:"options,omitempty"`
	When        *Predicate      `json:"when,omitempty"`
	Validators  []Validator     `json:"validators,omitempty"`
}

type Option struct {
	Value string `json:"value"`
	Label string `json:"label,omitempty"`
}

type Validator struct {
	Kind string `json:"kind"`
	Arg  string `json:"arg,omitempty"`
}

type Predicate struct {
	Path   string          `json:"path,omitempty"`
	Equals json.RawMessage `json:"equals,omitempty"`
	Exists *bool           `json:"exists,omitempty"`
	AllOf  []Predicate     `json:"allOf,omitempty"`
	AnyOf  []Predicate     `json:"anyOf,omitempty"`
	Not    *Predicate      `json:"not,omitempty"`
}

type State struct {
	ScenarioID string                     `json:"scenarioId"`
	PageIndex  int                        `json:"pageIndex"`
	Values     map[string]json.RawMessage `json:"values"`
	Errors     []FieldError               `json:"errors,omitempty"`
	Done       bool                       `json:"done"`
}

type Answer struct {
	FieldID string          `json:"fieldId"`
	Value   json.RawMessage `json:"value"`
}

type FieldError struct {
	Code       string   `json:"code"`
	FieldID    string   `json:"fieldId"`
	Message    string   `json:"message"`
	Recoveries []string `json:"recoveries,omitempty"`
}

func (e FieldError) Error() string {
	if e.FieldID == "" {
		return e.Code + ": " + e.Message
	}
	return e.Code + " (" + e.FieldID + "): " + e.Message
}

func New(scenario Scenario) (State, error) {
	if scenario.ID == "" || scenario.Schema == "" || len(scenario.Pages) == 0 {
		return State{}, fmt.Errorf("scenario requires schema, id, and pages")
	}
	state := State{ScenarioID: scenario.ID, Values: make(map[string]json.RawMessage)}
	for _, page := range scenario.Pages {
		for _, section := range page.Sections {
			for _, field := range section.Fields {
				if len(field.Default) > 0 {
					state.Values[field.ID] = append(json.RawMessage(nil), field.Default...)
				}
			}
		}
	}
	return state, nil
}

func (s Scenario) Current(state State) *Page {
	if state.Done || state.PageIndex < 0 || state.PageIndex >= len(s.Pages) {
		return nil
	}
	page := s.Pages[state.PageIndex]
	if page.When != nil && !page.When.Evaluate(state.Values) {
		return nil
	}
	return &page
}

func (s Scenario) Answer(state State, answer Answer) (State, error) {
	field, ok := s.field(answer.FieldID)
	if !ok {
		return state, FieldError{Code: "UNKNOWN_FIELD", FieldID: answer.FieldID, Message: "field is not declared by the scenario", Recoveries: []string{"back", "inspect"}}
	}
	if field.When != nil && !field.When.Evaluate(state.Values) {
		return state, FieldError{Code: "FIELD_NOT_VISIBLE", FieldID: answer.FieldID, Message: "field is not active for the current answers", Recoveries: []string{"back", "inspect"}}
	}
	if err := validate(field, answer.Value); err != nil {
		return state, err
	}
	if state.Values == nil {
		state.Values = make(map[string]json.RawMessage)
	}
	state.Values[answer.FieldID] = append(json.RawMessage(nil), answer.Value...)
	state.Errors = nil
	return state, nil
}

func (s Scenario) Next(state State) (State, error) {
	if state.Done {
		return state, nil
	}
	if state.PageIndex < 0 || state.PageIndex >= len(s.Pages) {
		return state, fmt.Errorf("page index %d out of range", state.PageIndex)
	}
	page := s.Pages[state.PageIndex]
	for _, section := range page.Sections {
		for _, field := range section.Fields {
			if field.When != nil && !field.When.Evaluate(state.Values) {
				continue
			}
			value, exists := state.Values[field.ID]
			if field.Required && (!exists || len(bytes.TrimSpace(value)) == 0 || bytes.Equal(value, []byte("null"))) {
				err := FieldError{Code: "REQUIRED", FieldID: field.ID, Message: "this field is required", Recoveries: []string{"answer", "back"}}
				state.Errors = []FieldError{err}
				return state, err
			}
		}
	}
	state.Errors = nil
	for next := state.PageIndex + 1; next < len(s.Pages); next++ {
		if s.Pages[next].When == nil || s.Pages[next].When.Evaluate(state.Values) {
			state.PageIndex = next
			return state, nil
		}
	}
	state.Done = true
	return state, nil
}

func (s Scenario) Back(state State) State {
	if state.Done {
		state.Done = false
	}
	for previous := state.PageIndex - 1; previous >= 0; previous-- {
		if s.Pages[previous].When == nil || s.Pages[previous].When.Evaluate(state.Values) {
			state.PageIndex = previous
			state.Errors = nil
			return state
		}
	}
	state.PageIndex = 0
	state.Errors = nil
	return state
}

func (s Scenario) field(id string) (Field, bool) {
	for _, page := range s.Pages {
		for _, section := range page.Sections {
			for _, field := range section.Fields {
				if field.ID == id {
					return field, true
				}
			}
		}
	}
	return Field{}, false
}

func validate(field Field, raw json.RawMessage) error {
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return FieldError{Code: "INVALID_JSON", FieldID: field.ID, Message: err.Error(), Recoveries: []string{"answer", "back"}}
	}
	if field.Required && (value == nil || value == "") {
		return FieldError{Code: "REQUIRED", FieldID: field.ID, Message: "this field is required", Recoveries: []string{"answer", "back"}}
	}
	if len(field.Options) > 0 {
		var text string
		if err := json.Unmarshal(raw, &text); err != nil {
			return FieldError{Code: "INVALID_OPTION", FieldID: field.ID, Message: "value must be one of the declared options", Recoveries: []string{"answer", "back"}}
		}
		valid := false
		for _, option := range field.Options {
			if option.Value == text {
				valid = true
				break
			}
		}
		if !valid {
			return FieldError{Code: "INVALID_OPTION", FieldID: field.ID, Message: fmt.Sprintf("%q is not a declared option", text), Recoveries: []string{"answer", "back"}}
		}
	}
	for _, validator := range field.Validators {
		switch validator.Kind {
		case "nonEmpty":
			if text, ok := value.(string); !ok || text == "" {
				return FieldError{Code: "VALIDATION_FAILED", FieldID: field.ID, Message: "value must not be empty", Recoveries: []string{"answer", "back"}}
			}
		case "equals":
			if !reflect.DeepEqual(value, validator.Arg) {
				return FieldError{Code: "VALIDATION_FAILED", FieldID: field.ID, Message: "value does not match validator", Recoveries: []string{"answer", "back"}}
			}
		default:
			return FieldError{Code: "UNKNOWN_VALIDATOR", FieldID: field.ID, Message: fmt.Sprintf("validator %q is not registered", validator.Kind), Recoveries: []string{"inspect"}}
		}
	}
	return nil
}

func (p Predicate) Evaluate(values map[string]json.RawMessage) bool {
	if len(p.AllOf) > 0 {
		for _, child := range p.AllOf {
			if !child.Evaluate(values) {
				return false
			}
		}
	}
	if len(p.AnyOf) > 0 {
		matched := false
		for _, child := range p.AnyOf {
			if child.Evaluate(values) {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	if p.Not != nil && p.Not.Evaluate(values) {
		return false
	}
	raw, exists := values[p.Path]
	if p.Path == "" {
		return true
	}
	if p.Exists != nil {
		return exists == *p.Exists
	}
	if !exists {
		return false
	}
	if len(p.Equals) > 0 {
		var left, right any
		if json.Unmarshal(raw, &left) != nil || json.Unmarshal(p.Equals, &right) != nil {
			return false
		}
		return reflect.DeepEqual(left, right)
	}
	return exists
}
