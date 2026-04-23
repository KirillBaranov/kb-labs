package releases

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func mustLoad(t *testing.T, dir string) *Store {
	t.Helper()
	s, err := Load(dir)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	return s
}

func TestLoad_EmptyWhenMissing(t *testing.T) {
	dir := t.TempDir()
	s := mustLoad(t, dir)
	if s.Schema != SchemaVersion {
		t.Errorf("schema = %q, want %q", s.Schema, SchemaVersion)
	}
	if len(s.Releases) != 0 {
		t.Errorf("want empty, got %d releases", len(s.Releases))
	}
	if s.Current == nil || s.Previous == nil {
		t.Error("Current/Previous must be non-nil even when empty")
	}
}

func TestSaveLoad_Roundtrip(t *testing.T) {
	dir := t.TempDir()
	s := mustLoad(t, dir)

	s.AppendRelease(Release{
		ID:        "gateway-1.0.0-abc",
		Service:   "@kb-labs/gateway",
		Version:   "1.0.0",
		CreatedAt: time.Now().UTC().Truncate(time.Second),
		Source:    "install-service",
	})
	s.Current["@kb-labs/gateway"] = "gateway-1.0.0-abc"

	if err := s.Save(); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got := mustLoad(t, dir)
	if len(got.Releases) != 1 || got.Releases[0].ID != "gateway-1.0.0-abc" {
		t.Errorf("roundtrip lost release: %+v", got.Releases)
	}
	if got.Current["@kb-labs/gateway"] != "gateway-1.0.0-abc" {
		t.Errorf("Current not preserved: %v", got.Current)
	}
}

func TestAppendRelease_ReplacesDuplicateID(t *testing.T) {
	s := mustLoad(t, t.TempDir())
	s.AppendRelease(Release{ID: "x", Service: "@kb-labs/gateway", Version: "1"})
	s.AppendRelease(Release{ID: "x", Service: "@kb-labs/gateway", Version: "2"}) // same id, new content
	if len(s.Releases) != 1 {
		t.Fatalf("expected 1, got %d", len(s.Releases))
	}
	if s.Releases[0].Version != "2" {
		t.Errorf("expected replacement, got %q", s.Releases[0].Version)
	}
}

func TestFind(t *testing.T) {
	s := mustLoad(t, t.TempDir())
	s.AppendRelease(Release{ID: "a", Service: "@kb-labs/gateway"})
	if s.Find("a") == nil {
		t.Error("Find(existing) returned nil")
	}
	if s.Find("missing") != nil {
		t.Error("Find(missing) returned non-nil")
	}
}

func TestGC_KeepsCurrentAndPrevious(t *testing.T) {
	s := mustLoad(t, t.TempDir())
	svc := "@kb-labs/gateway"
	base := time.Now().UTC()
	// 5 releases, oldest first
	for i := 0; i < 5; i++ {
		s.AppendRelease(Release{
			ID:        letterID(i),
			Service:   svc,
			Version:   "1.0.0",
			CreatedAt: base.Add(time.Duration(i) * time.Minute),
		})
	}
	// Newest (r4) is current, r3 is previous. keep=1 should retain at most one more.
	s.Current[svc] = "r4"
	s.Previous[svc] = "r3"

	evicted, err := s.GC(svc, 1)
	if err != nil {
		t.Fatalf("GC: %v", err)
	}

	// Remaining should include r4 (current), r3 (previous), and exactly one more (newest non-protected).
	ids := map[string]bool{}
	for _, r := range s.Releases {
		ids[r.ID] = true
	}
	if !ids["r4"] || !ids["r3"] {
		t.Errorf("current/previous evicted: %v", ids)
	}
	if !ids["r2"] {
		t.Errorf("expected r2 (newest non-protected) retained: %v", ids)
	}
	if ids["r1"] || ids["r0"] {
		t.Errorf("old releases not evicted: %v", ids)
	}
	if len(evicted) != 2 {
		t.Errorf("expected 2 evicted, got %d (%v)", len(evicted), evicted)
	}
}

func TestGC_ZeroKeepErrors(t *testing.T) {
	s := mustLoad(t, t.TempDir())
	if _, err := s.GC("@kb-labs/gateway", 0); err == nil {
		t.Error("expected error for keep=0")
	}
}

func TestGC_OnlyAffectsRequestedService(t *testing.T) {
	s := mustLoad(t, t.TempDir())
	base := time.Now().UTC()
	s.AppendRelease(Release{ID: "g1", Service: "@kb-labs/gateway", CreatedAt: base})
	s.AppendRelease(Release{ID: "g2", Service: "@kb-labs/gateway", CreatedAt: base.Add(time.Minute)})
	s.AppendRelease(Release{ID: "r1", Service: "@kb-labs/rest-api", CreatedAt: base})

	s.Current["@kb-labs/gateway"] = "g2"

	if _, err := s.GC("@kb-labs/gateway", 0); err == nil {
		// sanity: keep=0 errors, but keep=1 should leave r1 untouched
	}
	_, err := s.GC("@kb-labs/gateway", 1)
	if err != nil {
		t.Fatalf("GC: %v", err)
	}
	// rest-api release must be untouched
	if s.Find("r1") == nil {
		t.Error("rest-api release evicted by gateway GC")
	}
}

func TestSave_RequiresLoadedStore(t *testing.T) {
	s := &Store{Schema: SchemaVersion}
	if err := s.Save(); err == nil {
		t.Error("expected error when platformDir is unset")
	}
}

func TestLoad_RejectsWrongSchema(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "releases.json")
	_ = writeFile(path, `{"schema":"kb.releases/999"}`)
	if _, err := Load(dir); err == nil {
		t.Error("expected error for wrong schema")
	}
}

// helpers

func letterID(i int) string {
	return []string{"r0", "r1", "r2", "r3", "r4"}[i]
}

func writeFile(path, content string) error {
	return os.WriteFile(path, []byte(content), 0o644)
}
