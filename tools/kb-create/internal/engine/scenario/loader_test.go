package scenario

import "testing"

func TestAllScenarioFixturesLoadThroughFlowValidator(t *testing.T) {
	for _, id := range IDs() {
		loaded, err := Load(id)
		if err != nil {
			t.Fatalf("%s: %v", id, err)
		}
		if loaded.ID != id {
			t.Fatalf("%s loaded as %s", id, loaded.ID)
		}
	}
}

func TestLoadRejectsPathTraversal(t *testing.T) {
	if _, err := Load("../commit"); err == nil {
		t.Fatal("path traversal accepted")
	}
}
