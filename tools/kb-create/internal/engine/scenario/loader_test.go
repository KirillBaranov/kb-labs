package scenario

import (
	"testing"

	"github.com/kb-labs/create/internal/engine/flow"
	engineui "github.com/kb-labs/create/internal/engine/ui"
)

func TestAllScenarioFixturesLoadThroughFlowValidator(t *testing.T) {
	for _, id := range IDs() {
		loaded, err := Load(id)
		if err != nil {
			t.Fatalf("%s: %v", id, err)
		}
		if loaded.ID != id {
			t.Fatalf("%s loaded as %s", id, loaded.ID)
		}
		state, err := flow.New(loaded)
		if err != nil {
			t.Fatalf("%s cannot initialize state: %v", id, err)
		}
		if _, err := engineui.FromPage(loaded, state); err != nil {
			t.Fatalf("%s cannot be rendered by the shared UI: %v", id, err)
		}
	}
}

func TestLoadRejectsPathTraversal(t *testing.T) {
	if _, err := Load("../commit"); err == nil {
		t.Fatal("path traversal accepted")
	}
}
