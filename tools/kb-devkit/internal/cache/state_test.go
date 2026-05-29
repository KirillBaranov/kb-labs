package cache

import (
	"path/filepath"
	"testing"
)

func TestStateIsDirtyWhenMissing(t *testing.T) {
	ss := NewStateStore(filepath.Join(t.TempDir(), ".kb", "devkit"))
	if !ss.IsDirty("@kb/app", "build") {
		t.Fatal("IsDirty = false for missing state, want true")
	}
}

func TestStateSetCleanRoundtrip(t *testing.T) {
	ss := NewStateStore(filepath.Join(t.TempDir(), ".kb", "devkit"))
	if err := ss.SetClean("@kb/app", "build", "abc123"); err != nil {
		t.Fatalf("SetClean error: %v", err)
	}
	st, ok := ss.Get("@kb/app", "build")
	if !ok {
		t.Fatal("Get = (_, false), want (_, true)")
	}
	if st.Kind != TaskStateClean {
		t.Fatalf("Kind = %q, want %q", st.Kind, TaskStateClean)
	}
	if st.InputHash != "abc123" {
		t.Fatalf("InputHash = %q, want %q", st.InputHash, "abc123")
	}
	if ss.IsDirty("@kb/app", "build") {
		t.Fatal("IsDirty = true after SetClean, want false")
	}
}

func TestStateSetDirtyRoundtrip(t *testing.T) {
	ss := NewStateStore(filepath.Join(t.TempDir(), ".kb", "devkit"))
	if err := ss.SetDirty("@kb/app", "build", "last_run_failed"); err != nil {
		t.Fatalf("SetDirty error: %v", err)
	}
	st, ok := ss.Get("@kb/app", "build")
	if !ok {
		t.Fatal("Get = (_, false), want (_, true)")
	}
	if st.Kind != TaskStateDirty {
		t.Fatalf("Kind = %q, want %q", st.Kind, TaskStateDirty)
	}
	if st.Reason != "last_run_failed" {
		t.Fatalf("Reason = %q, want %q", st.Reason, "last_run_failed")
	}
	if !ss.IsDirty("@kb/app", "build") {
		t.Fatal("IsDirty = false after SetDirty, want true")
	}
}

func TestStateSetCleanOverridesDirty(t *testing.T) {
	ss := NewStateStore(filepath.Join(t.TempDir(), ".kb", "devkit"))
	if err := ss.SetDirty("@kb/app", "build", "last_run_failed"); err != nil {
		t.Fatalf("SetDirty error: %v", err)
	}
	if err := ss.SetClean("@kb/app", "build", "newHash"); err != nil {
		t.Fatalf("SetClean error: %v", err)
	}
	if ss.IsDirty("@kb/app", "build") {
		t.Fatal("IsDirty = true after SetClean override, want false")
	}
}

func TestStateSlugIsolation(t *testing.T) {
	ss := NewStateStore(filepath.Join(t.TempDir(), ".kb", "devkit"))
	if err := ss.SetClean("@kb/app", "build", "h1"); err != nil {
		t.Fatalf("SetClean @kb/app: %v", err)
	}
	if err := ss.SetDirty("@kb/other", "build", "x"); err != nil {
		t.Fatalf("SetDirty @kb/other: %v", err)
	}
	if ss.IsDirty("@kb/app", "build") {
		t.Fatal("@kb/app should be CLEAN")
	}
	if !ss.IsDirty("@kb/other", "build") {
		t.Fatal("@kb/other should be DIRTY")
	}
}
