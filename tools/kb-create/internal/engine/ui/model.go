// Package ui defines the common, headless UI kit contract. It is deliberately
// independent from Bubble Tea and JSON transport: Human, Agent, and future
// web/IDE drivers render the same model and consume the same actions/errors.
package ui

import (
	"encoding/json"
	"fmt"

	"github.com/kb-labs/create/internal/engine/flow"
)

type ControlKind string

const (
	ControlText        ControlKind = "text"
	ControlTextarea    ControlKind = "textarea"
	ControlSecret      ControlKind = "secret"
	ControlSelect      ControlKind = "select"
	ControlMultiSelect ControlKind = "multiselect"
	ControlConfirm     ControlKind = "confirm"
	ControlPath        ControlKind = "path"
	ControlNumber      ControlKind = "number"
)

type Screen struct {
	ID          string      `json:"id"`
	Title       string      `json:"title,omitempty"`
	Description string      `json:"description,omitempty"`
	Sections    []Section   `json:"sections"`
	Actions     []Action    `json:"actions"`
	CopyOffers  []CopyOffer `json:"copyOffers,omitempty"`
	Errors      []Error     `json:"errors,omitempty"`
}

type Section struct {
	ID          string  `json:"id"`
	Title       string  `json:"title,omitempty"`
	Description string  `json:"description,omitempty"`
	Fields      []Field `json:"fields"`
}

type Field struct {
	ID          string          `json:"id"`
	Kind        ControlKind     `json:"kind"`
	Label       string          `json:"label,omitempty"`
	Description string          `json:"description,omitempty"`
	Placeholder string          `json:"placeholder,omitempty"`
	Required    bool            `json:"required,omitempty"`
	Secret      bool            `json:"secret,omitempty"`
	Value       json.RawMessage `json:"value,omitempty"`
	Options     []Option        `json:"options,omitempty"`
	Errors      []Error         `json:"errors,omitempty"`
}

type Option struct {
	Value string `json:"value"`
	Label string `json:"label,omitempty"`
}

type Action struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	Kind    string `json:"kind"`
	Primary bool   `json:"primary,omitempty"`
}

type CopyOffer struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Text  string `json:"text"`
}

type Error struct {
	Code       string   `json:"code"`
	FieldID    string   `json:"fieldId,omitempty"`
	Message    string   `json:"message"`
	Recoveries []string `json:"recoveries,omitempty"`
}

func FromPage(scenario flow.Scenario, state flow.State) (Screen, error) {
	page := scenario.Current(state)
	if page == nil {
		if state.Done {
			return Screen{ID: "completed", Title: "Complete", Actions: []Action{{ID: "finish", Label: "Finish", Kind: "finish", Primary: true}}}, nil
		}
		return Screen{}, fmt.Errorf("no active page for scenario %q", scenario.ID)
	}
	screen := Screen{ID: page.ID, Title: page.Title, Sections: make([]Section, 0, len(page.Sections)), Actions: []Action{{ID: "back", Label: "Back", Kind: "back"}, {ID: "next", Label: "Continue", Kind: "next", Primary: true}}}
	for _, section := range page.Sections {
		model := Section{ID: section.ID, Title: section.Title, Description: section.Description, Fields: make([]Field, 0, len(section.Fields))}
		for _, source := range section.Fields {
			if source.When != nil && !source.When.Evaluate(state.Values) {
				continue
			}
			kind, err := controlKind(source.Type)
			if err != nil {
				return Screen{}, fmt.Errorf("field %s: %w", source.ID, err)
			}
			field := Field{ID: source.ID, Kind: kind, Label: source.Label, Description: source.Description, Placeholder: source.Placeholder, Required: source.Required, Secret: source.Secret}
			if field.Label == "" {
				field.Label = source.ID
			}
			for _, option := range source.Options {
				field.Options = append(field.Options, Option{Value: option.Value, Label: option.Label})
			}
			if value, ok := state.Values[source.ID]; ok && !source.Secret {
				field.Value = append(json.RawMessage(nil), value...)
				if len(value) > 0 {
					screen.CopyOffers = append(screen.CopyOffers, CopyOffer{ID: "copy:" + source.ID, Label: "Copy " + field.Label, Text: string(value)})
				}
			}
			for _, fieldError := range state.Errors {
				if fieldError.FieldID == source.ID {
					field.Errors = append(field.Errors, toError(fieldError))
				}
			}
			model.Fields = append(model.Fields, field)
		}
		screen.Sections = append(screen.Sections, model)
	}
	for _, fieldError := range state.Errors {
		if fieldError.FieldID == "" {
			screen.Errors = append(screen.Errors, toError(fieldError))
		}
	}
	return screen, nil
}

func controlKind(source string) (ControlKind, error) {
	switch source {
	case "text":
		return ControlText, nil
	case "textarea":
		return ControlTextarea, nil
	case "secret":
		return ControlSecret, nil
	case "select":
		return ControlSelect, nil
	case "multiselect":
		return ControlMultiSelect, nil
	case "confirm":
		return ControlConfirm, nil
	case "path":
		return ControlPath, nil
	case "number":
		return ControlNumber, nil
	default:
		return "", fmt.Errorf("unsupported control type %q", source)
	}
}

func toError(source flow.FieldError) Error {
	return Error{Code: source.Code, FieldID: source.FieldID, Message: source.Message, Recoveries: source.Recoveries}
}
