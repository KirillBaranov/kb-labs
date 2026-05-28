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

func TestTargetStateStatusRoundtrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	s := &State{
		Targets: map[string]TargetState{
			"web": {SHA: "abc", Status: "failed", FailReason: "push", DeployedAt: time.Now().UTC().Truncate(time.Second)},
		},
	}
	if err := Save(path, s); err != nil {
		t.Fatalf("Save: %v", err)
	}
	got, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	ts := got.Targets["web"]
	if ts.Status != "failed" {
		t.Errorf("Status = %q, want failed", ts.Status)
	}
	if ts.FailReason != "push" {
		t.Errorf("FailReason = %q, want push", ts.FailReason)
	}
}

func TestTargetStateBackwardCompatEmptyStatus(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	// Simulate an old state record without the Status field.
	s := &State{
		Targets: map[string]TargetState{
			"web": {SHA: "abc", DeployedAt: time.Now().UTC()},
		},
	}
	if err := Save(path, s); err != nil {
		t.Fatalf("Save: %v", err)
	}
	got, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	ts := got.Targets["web"]
	if ts.Status != "" {
		t.Errorf("Status = %q, want empty (legacy record)", ts.Status)
	}
	// Empty status must NOT be treated as failure.
	if got.IsLastDeployFailed("web") {
		t.Fatal("IsLastDeployFailed = true for empty status, want false (legacy = success)")
	}
}

func TestIsLastDeployFailedReturnsTrueOnFailed(t *testing.T) {
	s := &State{Targets: map[string]TargetState{
		"web": {SHA: "abc", Status: "failed"},
	}}
	if !s.IsLastDeployFailed("web") {
		t.Fatal("IsLastDeployFailed = false for status=failed, want true")
	}
}

func TestIsLastDeployFailedReturnsFalseOnSuccess(t *testing.T) {
	s := &State{Targets: map[string]TargetState{
		"web": {SHA: "abc", Status: "success"},
	}}
	if s.IsLastDeployFailed("web") {
		t.Fatal("IsLastDeployFailed = true for status=success, want false")
	}
}

func TestIsLastDeployFailedReturnsFalseWhenMissing(t *testing.T) {
	s := &State{Targets: map[string]TargetState{}}
	if s.IsLastDeployFailed("web") {
		t.Fatal("IsLastDeployFailed = true for missing target, want false")
	}
}

func TestIsLastDeployFailedReturnsFalseOnEmptyStatus(t *testing.T) {
	s := &State{Targets: map[string]TargetState{
		"web": {SHA: "abc", Status: ""},
	}}
	if s.IsLastDeployFailed("web") {
		t.Fatal("IsLastDeployFailed = true for empty status, want false")
	}
}
