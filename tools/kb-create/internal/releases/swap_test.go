package releases

import (
	"os"
	"path/filepath"
	"testing"
)

// setupPlatform creates a temp platform dir with releases/<id> directories
// for the given ids. Returns the platform dir.
func setupPlatform(t *testing.T, ids ...string) string {
	t.Helper()
	dir := t.TempDir()
	for _, id := range ids {
		if err := os.MkdirAll(filepath.Join(dir, "releases", id), 0o750); err != nil {
			t.Fatalf("create release %s: %v", id, err)
		}
	}
	return dir
}

func readSymlink(t *testing.T, path string) string {
	t.Helper()
	target, err := os.Readlink(path)
	if err != nil {
		t.Fatalf("readlink %s: %v", path, err)
	}
	return target
}

func TestSwap_FirstTime(t *testing.T) {
	dir := setupPlatform(t, "gateway-1.0.0-aaa")
	if err := Swap(dir, "@kb-labs/gateway", "gateway-1.0.0-aaa"); err != nil {
		t.Fatalf("Swap: %v", err)
	}

	current := filepath.Join(dir, "services", "gateway", "current")
	target := readSymlink(t, current)
	if filepath.Base(target) != "gateway-1.0.0-aaa" {
		t.Errorf("current target = %q, want ...gateway-1.0.0-aaa", target)
	}

	// No previous yet.
	prev := filepath.Join(dir, "services", "gateway", "previous")
	if _, err := os.Readlink(prev); err == nil {
		t.Error("previous should not exist on first swap")
	}

	// Store reflects current.
	store, err := Load(dir)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if store.Current["@kb-labs/gateway"] != "gateway-1.0.0-aaa" {
		t.Errorf("store.Current = %v", store.Current)
	}
}

func TestSwap_SecondTimeUpdatesPrevious(t *testing.T) {
	dir := setupPlatform(t, "gateway-1.0.0-aaa", "gateway-1.1.0-bbb")

	if err := Swap(dir, "@kb-labs/gateway", "gateway-1.0.0-aaa"); err != nil {
		t.Fatalf("first Swap: %v", err)
	}
	if err := Swap(dir, "@kb-labs/gateway", "gateway-1.1.0-bbb"); err != nil {
		t.Fatalf("second Swap: %v", err)
	}

	current := readSymlink(t, filepath.Join(dir, "services", "gateway", "current"))
	previous := readSymlink(t, filepath.Join(dir, "services", "gateway", "previous"))
	if filepath.Base(current) != "gateway-1.1.0-bbb" {
		t.Errorf("current = %q", current)
	}
	if filepath.Base(previous) != "gateway-1.0.0-aaa" {
		t.Errorf("previous = %q", previous)
	}

	store, _ := Load(dir)
	if store.Current["@kb-labs/gateway"] != "gateway-1.1.0-bbb" ||
		store.Previous["@kb-labs/gateway"] != "gateway-1.0.0-aaa" {
		t.Errorf("store out of sync: current=%v previous=%v", store.Current, store.Previous)
	}
}

func TestSwap_MissingReleaseErrors(t *testing.T) {
	dir := setupPlatform(t) // no releases
	if err := Swap(dir, "@kb-labs/gateway", "gateway-missing"); err == nil {
		t.Error("expected error when release directory does not exist")
	}
}

func TestSwap_EmptyReleaseIDErrors(t *testing.T) {
	dir := setupPlatform(t)
	if err := Swap(dir, "@kb-labs/gateway", ""); err == nil {
		t.Error("expected error for empty releaseID")
	}
}

func TestRollback_RestoresPrevious(t *testing.T) {
	dir := setupPlatform(t, "a", "b")

	if err := Swap(dir, "@kb-labs/gateway", "a"); err != nil {
		t.Fatalf("swap a: %v", err)
	}
	if err := Swap(dir, "@kb-labs/gateway", "b"); err != nil {
		t.Fatalf("swap b: %v", err)
	}
	if err := Rollback(dir, "@kb-labs/gateway"); err != nil {
		t.Fatalf("Rollback: %v", err)
	}

	current := readSymlink(t, filepath.Join(dir, "services", "gateway", "current"))
	if filepath.Base(current) != "a" {
		t.Errorf("after rollback current = %q, want a", current)
	}

	// After rollback, previous now points at b (the swap flipped them).
	previous := readSymlink(t, filepath.Join(dir, "services", "gateway", "previous"))
	if filepath.Base(previous) != "b" {
		t.Errorf("after rollback previous = %q, want b", previous)
	}
}

func TestRollback_NoPreviousErrors(t *testing.T) {
	dir := setupPlatform(t, "a")
	if err := Swap(dir, "@kb-labs/gateway", "a"); err != nil {
		t.Fatalf("swap: %v", err)
	}
	if err := Rollback(dir, "@kb-labs/gateway"); err == nil {
		t.Error("expected rollback to fail when previous is absent")
	}
}

func TestCurrentReleaseID(t *testing.T) {
	dir := setupPlatform(t, "gateway-1.0.0-abc")

	id, err := CurrentReleaseID(dir, "@kb-labs/gateway")
	if err != nil {
		t.Fatalf("CurrentReleaseID (no current): %v", err)
	}
	if id != "" {
		t.Errorf("expected empty id before swap, got %q", id)
	}

	if err := Swap(dir, "@kb-labs/gateway", "gateway-1.0.0-abc"); err != nil {
		t.Fatalf("Swap: %v", err)
	}

	id, err = CurrentReleaseID(dir, "@kb-labs/gateway")
	if err != nil {
		t.Fatalf("CurrentReleaseID: %v", err)
	}
	if id != "gateway-1.0.0-abc" {
		t.Errorf("got %q, want gateway-1.0.0-abc", id)
	}
}

func TestIDFromSymlinkTarget(t *testing.T) {
	cases := []struct{ in, want string }{
		{"../../releases/gateway-1.0.0-abc", "gateway-1.0.0-abc"},
		{"../../releases/gateway-1.0.0-abc/", "gateway-1.0.0-abc"},
		{"/abs/path/to/releases/x", "x"},
		{"", ""},
		{"/", ""},
	}
	for _, c := range cases {
		got := idFromSymlinkTarget(c.in)
		if got != c.want {
			t.Errorf("idFromSymlinkTarget(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestServiceShort(t *testing.T) {
	if got := ServiceShort("@kb-labs/gateway"); got != "gateway" {
		t.Errorf("got %q, want gateway", got)
	}
	if got := ServiceShort("plain"); got != "plain" {
		t.Errorf("got %q, want plain", got)
	}
}
