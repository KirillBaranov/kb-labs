package state

import (
	"path/filepath"
	"testing"
	"time"
)

func TestLoadMissing(t *testing.T) {
	s, err := Load(filepath.Join(t.TempDir(), "state.json"))
	if err != nil {
		t.Fatalf("Load on missing file: %v", err)
	}
	if s.Targets == nil {
		t.Fatal("Targets map should be initialized")
	}
	if len(s.Targets) != 0 {
		t.Fatalf("expected empty targets, got %d", len(s.Targets))
	}
}

func TestSaveAndLoad(t *testing.T) {
	path := filepath.Join(t.TempDir(), "deploy", "state.json")

	s := &State{
		Targets: map[string]TargetState{
			"web": {SHA: "abc1234", DeployedAt: time.Now().UTC().Truncate(time.Second)},
		},
	}

	if err := Save(path, s); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	ts, ok := got.Targets["web"]
	if !ok {
		t.Fatal("target 'web' missing after load")
	}
	if ts.SHA != "abc1234" {
		t.Errorf("SHA = %q, want abc1234", ts.SHA)
	}
	if !ts.DeployedAt.Equal(s.Targets["web"].DeployedAt) {
		t.Errorf("DeployedAt mismatch: %v vs %v", ts.DeployedAt, s.Targets["web"].DeployedAt)
	}
}

func TestSaveCreatesDirs(t *testing.T) {
	// Path with nested dirs that don't exist yet.
	path := filepath.Join(t.TempDir(), "a", "b", "c", "state.json")
	s := &State{Targets: map[string]TargetState{}}
	if err := Save(path, s); err != nil {
		t.Fatalf("Save with missing parent dirs: %v", err)
	}
}
