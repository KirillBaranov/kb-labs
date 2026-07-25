package terminal

import (
	"context"
	"testing"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/kb-labs/create/internal/engine/flow"
	engineui "github.com/kb-labs/create/internal/engine/ui"
)

type clipboardStub struct{ value string }

func (c *clipboardStub) Copy(_ context.Context, value string) error { c.value = value; return nil }
func (*clipboardStub) Available() bool                              { return true }

func terminalScenario() flow.Scenario {
	return flow.Scenario{Schema: "kb.scenario/1", ID: "terminal", Title: "Terminal", Pages: []flow.Page{{
		ID: "page", Sections: []flow.Section{{ID: "section", Fields: []flow.Field{
			{ID: "name", Type: "text", Label: "Name", Required: true},
			{ID: "enabled", Type: "confirm", Label: "Enabled", Default: []byte("true")},
		}}},
	}}}
}

func TestModelUsesSessionValidationAndNavigation(t *testing.T) {
	session, err := flow.NewSession(terminalScenario(), nil)
	if err != nil {
		t.Fatal(err)
	}
	model, err := New(session, engineui.UnavailableClipboard{})
	if err != nil {
		t.Fatal(err)
	}
	updated, cmd := model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	model = updated.(Model)
	if cmd != nil {
		t.Fatal("unexpected command while required field is empty")
	}
	if len(model.session.State.Errors) != 1 || model.session.State.Errors[0].Code != "REQUIRED" {
		t.Fatalf("errors = %#v, want required error", model.session.State.Errors)
	}
	input := model.inputs["name"]
	input.SetValue("alice")
	model.inputs["name"] = input
	model.cursor = 0
	updated, _ = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	model = updated.(Model)
	updated, _ = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	model = updated.(Model)
	updated, _ = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	model = updated.(Model)
	if !model.session.State.Done {
		t.Fatal("expected session to complete after valid answers")
	}
}

func TestModelDoesNotOfferSecretClipboardCopy(t *testing.T) {
	scenario := terminalScenario()
	scenario.Pages[0].Sections[0].Fields[0].Secret = true
	session, err := flow.NewSession(scenario, nil)
	if err != nil {
		t.Fatal(err)
	}
	clipboard := &clipboardStub{}
	model, err := New(session, clipboard)
	if err != nil {
		t.Fatal(err)
	}
	input := model.inputs["name"]
	input.SetValue("secret")
	model.inputs["name"] = input
	model.cursor = 0
	updated, _ := model.Update(tea.KeyMsg{Type: tea.KeyCtrlY})
	model = updated.(Model)
	if clipboard.value != "" {
		t.Fatalf("secret value copied: %q", clipboard.value)
	}
}
