package ui

import (
	"context"
	"testing"

	"github.com/kb-labs/create/internal/engine/flow"
)

type fakeClipboard struct {
	value     string
	available bool
}

func (f *fakeClipboard) Copy(_ context.Context, value string) error { f.value = value; return nil }
func (f *fakeClipboard) Available() bool                            { return f.available }

func TestCopyOffersNeverExposeSecretFields(t *testing.T) {
	scenario := testScenarioForClipboard()
	state, _ := flow.New(scenario)
	state.Values["public"] = []byte(`"copy me"`)
	state.Values["secret"] = []byte(`"do not copy"`)
	screen, err := FromPage(scenario, state)
	if err != nil {
		t.Fatal(err)
	}
	if len(screen.CopyOffers) != 1 || screen.CopyOffers[0].Text != `"copy me"` {
		t.Fatalf("offers = %#v", screen.CopyOffers)
	}
	fake := &fakeClipboard{available: true}
	if err := fake.Copy(context.Background(), screen.CopyOffers[0].Text); err != nil {
		t.Fatal(err)
	}
	if fake.value != `"copy me"` {
		t.Fatal(fake.value)
	}
}

func testScenarioForClipboard() flow.Scenario {
	return flow.Scenario{Schema: "kb.scenario/2", ID: "clipboard", Pages: []flow.Page{{ID: "p", Sections: []flow.Section{{ID: "s", Fields: []flow.Field{{ID: "public", Type: "text"}, {ID: "secret", Type: "secret", Secret: true}}}}}}}
}
