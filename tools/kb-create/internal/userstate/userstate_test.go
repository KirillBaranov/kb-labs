package userstate

import (
	"os"
	"path/filepath"
	"testing"
)

// withTempHome redirects state to a temp dir via KB_CREATE_STATE_HOME so
// tests never touch the real ~/.local/state/kb-create.
func withTempHome(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("KB_CREATE_STATE_HOME", dir)
	t.Setenv("XDG_STATE_HOME", "") // override takes precedence regardless, but be explicit
	return dir
}

func TestReadReturnsNilWhenMissing(t *testing.T) {
	withTempHome(t)

	s, err := Read()
	if err != nil {
		t.Fatalf("Read() error on missing file: %v", err)
	}
	if s != nil {
		t.Errorf("Read() = %+v, want nil on missing file", s)
	}
}

func TestWriteThenReadRoundTrip(t *testing.T) {
	withTempHome(t)

	want := &State{
		LastPlatformDir: "/opt/kb-platform",
		LastProjectDir:  "/home/user/proj",
	}
	if err := Write(want); err != nil {
		t.Fatalf("Write() error: %v", err)
	}

	got, err := Read()
	if err != nil {
		t.Fatalf("Read() error: %v", err)
	}
	if got == nil {
		t.Fatal("Read() = nil after Write")
	}
	if got.LastPlatformDir != want.LastPlatformDir {
		t.Errorf("LastPlatformDir = %q, want %q", got.LastPlatformDir, want.LastPlatformDir)
	}
	if got.LastProjectDir != want.LastProjectDir {
		t.Errorf("LastProjectDir = %q, want %q", got.LastProjectDir, want.LastProjectDir)
	}
	if got.UpdatedAt.IsZero() {
		t.Error("UpdatedAt was not auto-populated")
	}
}

func TestWriteCreatesParentDir(t *testing.T) {
	base := withTempHome(t)

	// Parent dir (base/kb-create/) doesn't exist yet.
	if err := Write(&State{LastPlatformDir: "/x"}); err != nil {
		t.Fatalf("Write() error: %v", err)
	}

	if _, err := os.Stat(filepath.Join(base, "kb-create", "state.json")); err != nil {
		t.Errorf("state.json not created: %v", err)
	}
}

func TestClearRemovesFile(t *testing.T) {
	withTempHome(t)

	if err := Write(&State{LastPlatformDir: "/x"}); err != nil {
		t.Fatalf("Write() error: %v", err)
	}
	if err := Clear(); err != nil {
		t.Fatalf("Clear() error: %v", err)
	}

	s, err := Read()
	if err != nil {
		t.Fatalf("Read() after Clear error: %v", err)
	}
	if s != nil {
		t.Errorf("Read() after Clear = %+v, want nil", s)
	}
}

func TestClearIdempotentWhenMissing(t *testing.T) {
	withTempHome(t)

	// No write first.
	if err := Clear(); err != nil {
		t.Errorf("Clear() on missing file returned error: %v", err)
	}
}

func TestPathHonorsXDGStateHome(t *testing.T) {
	t.Setenv("KB_CREATE_STATE_HOME", "") // drop override so XDG wins
	t.Setenv("XDG_STATE_HOME", "/custom/xdg")

	p, err := Path()
	if err != nil {
		t.Fatalf("Path() error: %v", err)
	}
	want := filepath.Join("/custom/xdg", "kb-create", "state.json")
	if p != want {
		t.Errorf("Path() = %q, want %q", p, want)
	}
}
