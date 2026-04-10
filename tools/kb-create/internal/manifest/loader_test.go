package manifest

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// TestLoadDefault verifies that the embedded manifest parses successfully
// and contains the expected top-level fields.
func TestLoadDefault(t *testing.T) {
	m, err := LoadDefault()
	if err != nil {
		t.Fatalf("LoadDefault() error = %v", err)
	}
	if m.Version == "" {
		t.Error("manifest.Version is empty")
	}
	if len(m.Core) == 0 {
		t.Error("manifest.Core is empty — at least one core package expected")
	}
	if len(m.Services) == 0 {
		t.Error("manifest.Services is empty — at least one service expected")
	}
	if len(m.Plugins) == 0 {
		t.Error("manifest.Plugins is empty — at least one plugin expected")
	}
}

// TestCorePackageNames verifies that CorePackageNames returns one entry per core package.
func TestCorePackageNames(t *testing.T) {
	m, err := LoadDefault()
	if err != nil {
		t.Fatalf("LoadDefault() error = %v", err)
	}
	names := m.CorePackageNames()
	if len(names) != len(m.Core) {
		t.Errorf("CorePackageNames() len = %d, want %d", len(names), len(m.Core))
	}
	for _, n := range names {
		if n == "" {
			t.Error("CorePackageNames() contains empty string")
		}
	}
}

// TestLoadLocalOverride verifies that a local JSON file is used when provided.
func TestLoadLocalOverride(t *testing.T) {
	custom := Manifest{
		Version: "test-override",
		Core:    []Package{{Name: "@test/pkg"}},
	}
	data, _ := json.Marshal(custom)

	tmp := t.TempDir()
	path := filepath.Join(tmp, "manifest.json")
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}

	m, err := Load(LoadOptions{LocalOverride: path})
	if err != nil {
		t.Fatalf("Load(LocalOverride) error = %v", err)
	}
	if m.Version != "test-override" {
		t.Errorf("Version = %q, want %q", m.Version, "test-override")
	}
}

// TestLoadRemoteOK verifies that a valid remote manifest is used when reachable.
func TestLoadRemoteOK(t *testing.T) {
	custom := Manifest{Version: "remote-1.0"}
	data, _ := json.Marshal(custom)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(data)
	}))
	defer srv.Close()

	m, err := Load(LoadOptions{RemoteURL: srv.URL, Timeout: 2 * time.Second})
	if err != nil {
		t.Fatalf("Load(RemoteURL) error = %v", err)
	}
	if m.Version != "remote-1.0" {
		t.Errorf("Version = %q, want %q", m.Version, "remote-1.0")
	}
}

// TestLoadRemoteFallsBackToEmbedded verifies that a remote failure falls back to embedded.
func TestLoadRemoteFallsBackToEmbedded(t *testing.T) {
	// Point at a server that immediately returns 500.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer srv.Close()

	m, err := Load(LoadOptions{RemoteURL: srv.URL, Timeout: 2 * time.Second})
	if err != nil {
		t.Fatalf("Load() should fall back to embedded, got error = %v", err)
	}
	// Embedded manifest always has a non-empty version.
	if m.Version == "" {
		t.Error("fallback manifest.Version is empty")
	}
}

// TestLoadRemoteFallsBackToLocalOverride verifies the full fallback chain:
// remote fails → local override used.
func TestLoadRemoteFallsBackToLocalOverride(t *testing.T) {
	custom := Manifest{Version: "local-override"}
	data, _ := json.Marshal(custom)

	tmp := t.TempDir()
	path := filepath.Join(tmp, "manifest.json")
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}

	// Use an unreachable URL so remote fails immediately.
	m, err := Load(LoadOptions{
		RemoteURL:     "http://127.0.0.1:0/manifest.json", // nothing listening
		LocalOverride: path,
		Timeout:       100 * time.Millisecond,
	})
	if err != nil {
		t.Fatalf("Load() should fall back to local override, got error = %v", err)
	}
	if m.Version != "local-override" {
		t.Errorf("Version = %q, want %q", m.Version, "local-override")
	}
}

// TestLoadInvalidJSON verifies that a corrupt override returns a parse error.
func TestLoadInvalidJSON(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "bad.json")
	if err := os.WriteFile(path, []byte("{not valid json"), 0o600); err != nil {
		t.Fatal(err)
	}

	_, err := Load(LoadOptions{LocalOverride: path})
	if err == nil {
		t.Error("expected error for invalid JSON, got nil")
	}
}

// TestComponentDefaults verifies that default-marked services/plugins are present.
func TestComponentDefaults(t *testing.T) {
	m, _ := LoadDefault()

	hasDefaultService := false
	for _, s := range m.Services {
		if s.Default {
			hasDefaultService = true
			break
		}
	}
	if !hasDefaultService {
		t.Error("no service marked as default in embedded manifest")
	}

	hasDefaultPlugin := false
	for _, p := range m.Plugins {
		if p.Default {
			hasDefaultPlugin = true
			break
		}
	}
	if !hasDefaultPlugin {
		t.Error("no plugin marked as default in embedded manifest")
	}
}
