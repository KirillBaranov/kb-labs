// Package terminal is the human driver for the declarative UI model.
//
// It intentionally contains no scenario-specific branches: every control is
// rendered from ui.Screen and every transition goes through flow.Session.
package terminal

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"

	"github.com/kb-labs/create/internal/engine/flow"
	engineui "github.com/kb-labs/create/internal/engine/ui"
)

var ErrCancelled = errors.New("interactive flow cancelled")

type Model struct {
	session   flow.Session
	clipboard engineui.Clipboard
	inputs    map[string]textinput.Model
	fields    []engineui.Field
	cursor    int
	status    string
	quitting  bool
	completed bool
}

func New(session flow.Session, clipboard engineui.Clipboard) (Model, error) {
	m := Model{session: session, clipboard: clipboard, inputs: make(map[string]textinput.Model)}
	if err := m.refresh(); err != nil {
		return Model{}, err
	}
	return m, nil
}

// Run starts the human driver. Agent and CI callers should use flow.Session
// directly; they receive the same validation and navigation behavior.
func Run(session flow.Session, clipboard engineui.Clipboard) (flow.State, error) {
	model, err := New(session, clipboard)
	if err != nil {
		return flow.State{}, err
	}
	result, err := tea.NewProgram(model).Run()
	if err != nil {
		return flow.State{}, err
	}
	model = result.(Model)
	if model.quitting && !model.completed {
		return model.session.State, ErrCancelled
	}
	return model.session.State, nil
}

func (m Model) Init() tea.Cmd { return nil }

func (m Model) Update(message tea.Msg) (tea.Model, tea.Cmd) {
	key, ok := message.(tea.KeyMsg)
	if !ok {
		return m, nil
	}
	switch key.String() {
	case "ctrl+c", "q":
		m.quitting = true
		return m, tea.Quit
	case "tab", "down":
		m.move(1)
		return m, nil
	case "shift+tab", "up":
		m.move(-1)
		return m, nil
	case "backspace":
		m.session.Back()
		_ = m.refresh()
		return m, nil
	case "ctrl+y":
		m.copyCurrent()
		return m, nil
	case "enter":
		if err := m.commitCurrent(); err != nil {
			m.status = err.Error()
			return m, nil
		}
		if m.cursor >= len(m.fields) {
			if err := m.session.Advance(); err != nil {
				m.status = err.Error()
				return m, nil
			}
			if m.session.State.Done {
				m.completed, m.quitting = true, true
				return m, tea.Quit
			}
			m.cursor = 0
			_ = m.refresh()
			return m, nil
		}
		m.move(1)
		return m, nil
	}
	if m.cursor < len(m.fields) {
		input := m.inputs[m.fields[m.cursor].ID]
		updated, cmd := input.Update(message)
		m.inputs[m.fields[m.cursor].ID] = updated
		return m, cmd
	}
	return m, nil
}

func (m Model) View() string {
	screen, err := engineui.FromPage(m.session.Scenario, m.session.State)
	if err != nil {
		return "Error: " + err.Error() + "\n"
	}
	var b strings.Builder
	fmt.Fprintf(&b, "\n%s\n\n", screen.Title)
	for _, section := range screen.Sections {
		if section.Title != "" {
			fmt.Fprintf(&b, "%s\n", section.Title)
		}
		if section.Description != "" {
			fmt.Fprintf(&b, "  %s\n", section.Description)
		}
		for _, field := range section.Fields {
			prefix := "  "
			if m.cursor < len(m.fields) && m.fields[m.cursor].ID == field.ID {
				prefix = "❯ "
			}
			value := m.inputs[field.ID].Value()
			if field.Secret && value != "" {
				value = strings.Repeat("•", len([]rune(value)))
			}
			fmt.Fprintf(&b, "%s%s: %s\n", prefix, field.Label, value)
			if field.Description != "" {
				fmt.Fprintf(&b, "    %s\n", field.Description)
			}
		}
	}
	if m.status != "" {
		fmt.Fprintf(&b, "\nError: %s\n", m.status)
	}
	fmt.Fprintln(&b, "\nTab/↑↓ navigate • Enter select/continue • Backspace back • Ctrl-Y copy • Q quit")
	return b.String()
}

func (m *Model) refresh() error {
	screen, err := engineui.FromPage(m.session.Scenario, m.session.State)
	if err != nil {
		return err
	}
	m.fields = m.fields[:0]
	for _, section := range screen.Sections {
		m.fields = append(m.fields, section.Fields...)
	}
	for _, field := range m.fields {
		input := textinput.New()
		input.Prompt = ""
		input.Placeholder = field.Placeholder
		input.EchoMode = textinput.EchoNormal
		if field.Secret {
			input.EchoMode = textinput.EchoPassword
		}
		if value, ok := m.session.State.Values[field.ID]; ok {
			input.SetValue(displayValue(value))
		}
		m.inputs[field.ID] = input
	}
	if m.cursor > len(m.fields) {
		m.cursor = len(m.fields)
	}
	return nil
}

func (m *Model) move(delta int) {
	max := len(m.fields)
	m.cursor += delta
	if m.cursor < 0 {
		m.cursor = 0
	}
	if m.cursor > max {
		m.cursor = max
	}
}

func (m *Model) commitCurrent() error {
	if m.cursor >= len(m.fields) {
		return nil
	}
	field := m.fields[m.cursor]
	raw, err := encodeValue(field, m.inputs[field.ID].Value())
	if err != nil {
		return flow.FieldError{Code: "INVALID_INPUT", FieldID: field.ID, Message: err.Error(), Recoveries: []string{"answer", "back"}}
	}
	return m.session.Apply(flow.Answer{FieldID: field.ID, Value: raw}, flow.SourceHuman)
}

func (m *Model) copyCurrent() {
	if m.cursor >= len(m.fields) || m.clipboard == nil {
		return
	}
	field := m.fields[m.cursor]
	if field.Secret {
		return
	}
	_ = m.clipboard.Copy(context.Background(), m.inputs[field.ID].Value())
}

func displayValue(raw json.RawMessage) string {
	var value string
	if json.Unmarshal(raw, &value) == nil {
		return value
	}
	return strings.Trim(string(raw), "\"")
}

func encodeValue(field engineui.Field, value string) (json.RawMessage, error) {
	value = strings.TrimSpace(value)
	switch field.Kind {
	case engineui.ControlConfirm:
		parsed, err := strconv.ParseBool(value)
		if err != nil {
			return nil, fmt.Errorf("expected true or false")
		}
		return json.Marshal(parsed)
	case engineui.ControlNumber:
		if _, err := strconv.ParseFloat(value, 64); err != nil {
			return nil, fmt.Errorf("expected a number")
		}
		return json.RawMessage(value), nil
	case engineui.ControlMultiSelect:
		items := make([]string, 0)
		for _, item := range strings.Split(value, ",") {
			if item = strings.TrimSpace(item); item != "" {
				items = append(items, item)
			}
		}
		return json.Marshal(items)
	default:
		return json.Marshal(value)
	}
}
