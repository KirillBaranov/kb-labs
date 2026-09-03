package orchestrator

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestGenDevManifestFiltersPlugins(t *testing.T) {
	ws := t.TempDir()
	manifestDir := filepath.Join(ws, "tools", "kb-create")
	if err := os.MkdirAll(manifestDir, 0o755); err != nil {
		t.Fatal(err)
	}
	src := `{
      "version": "3.0.0",
      "core": [{"name": "@kb-labs/sdk", "localPath": "/ws/sdk"}],
      "adapters": [{"name": "@kb-labs/data-store"}],
      "services": [{"id": "rest", "pkg": "@kb-labs/rest-api-app", "localPath": "/ws/rest"}],
      "plugins": [
        {"id": "mind", "pkg": "@kb-labs/mind-entry", "localPath": "/ws/mind"},
        {"id": "commit", "pkg": "@kb-labs/commit-entry"},
        {"id": "review", "pkg": "@kb-labs/review-entry"},
        {"id": "marketplace", "pkg": "@kb-labs/marketplace-entry"}
      ],
      "binaries": [{"id": "kb-dev", "name": "kb-dev", "localPath": "/ws/tools/kb-dev/kb-dev"}]
    }`
	if err := os.WriteFile(filepath.Join(manifestDir, "dev-manifest.json"), []byte(src), 0o600); err != nil {
		t.Fatal(err)
	}

	dst := filepath.Join(t.TempDir(), "dev-manifest.json")
	if err := GenManifest(ws, []string{"mind", "marketplace"}, []string{"rest", "gateway"}, true, dst); err != nil {
		t.Fatalf("GenManifest: %v", err)
	}

	data, _ := os.ReadFile(dst)
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatal(err)
	}

	plugins := m["plugins"].([]any)
	if len(plugins) != 2 {
		t.Fatalf("plugins kept = %d, want 2", len(plugins))
	}
	got := map[string]bool{}
	for _, p := range plugins {
		got[p.(map[string]any)["id"].(string)] = true
	}
	if !got["mind"] || !got["marketplace"] {
		t.Errorf("kept wrong plugins: %v", got)
	}
	if got["commit"] || got["review"] {
		t.Errorf("filtered plugins leaked: %v", got)
	}

	// Non-plugin sections must be preserved untouched.
	if len(m["services"].([]any)) != 1 || len(m["core"].([]any)) != 1 || len(m["binaries"].([]any)) != 1 {
		t.Errorf("non-plugin sections altered")
	}

	// localPath stripped from npm sections (install from registry)...
	mind := plugins[0].(map[string]any)
	if _, has := mind["localPath"]; has {
		t.Errorf("plugin localPath not stripped: %v", mind)
	}
	rest := m["services"].([]any)[0].(map[string]any)
	if _, has := rest["localPath"]; has {
		t.Errorf("service localPath not stripped: %v", rest)
	}
	// ...but binaries keep localPath (kb-dev copied from workspace build).
	bin := m["binaries"].([]any)[0].(map[string]any)
	if _, has := bin["localPath"]; !has {
		t.Errorf("binary localPath wrongly stripped: %v", bin)
	}
}
