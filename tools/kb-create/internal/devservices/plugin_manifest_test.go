package devservices

import (
	"os"
	"path/filepath"
	"testing"
)

// releaseManifestFixture mirrors the actual fields emitted into
// dist/manifest.json by plugins/release/manager-cli's manifest.ts after the
// devkit tsup preset's onSuccess hook resolves it (verified against a real
// build: schema kb.plugin/3, platform.requires ["storage","cache"],
// platform.optional ["llm","analytics","logger"], configSection "release").
const releaseManifestFixture = `{
  "schema": "kb.plugin/3",
  "id": "@kb-labs/release",
  "version": "0.1.0",
  "display": {
    "name": "Release Manager",
    "description": "Plan, execute, and audit releases across your workspace",
    "tags": ["release", "publish", "versioning"]
  },
  "platform": {
    "requires": ["storage", "cache"],
    "optional": ["llm", "analytics", "logger"]
  },
  "permissions": {
    "env": {
      "read": ["HOME", "NPM_TOKEN", "GITHUB_TOKEN", "KB_RELEASE_*"]
    }
  },
  "configSection": "release"
}`

func TestLoadPluginManifest_ParsesReleaseManifest(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "manifest.json")
	if err := os.WriteFile(path, []byte(releaseManifestFixture), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	m, err := LoadPluginManifest(path)
	if err != nil {
		t.Fatalf("LoadPluginManifest: %v", err)
	}

	if m.ID != "@kb-labs/release" {
		t.Errorf("ID = %q, want @kb-labs/release", m.ID)
	}
	if got, want := m.Platform.Requires, []string{"storage", "cache"}; !equalStrings(got, want) {
		t.Errorf("Platform.Requires = %v, want %v", got, want)
	}
	if got, want := m.Platform.Optional, []string{"llm", "analytics", "logger"}; !equalStrings(got, want) {
		t.Errorf("Platform.Optional = %v, want %v", got, want)
	}
	if m.ConfigSection != "release" {
		t.Errorf("ConfigSection = %q, want release", m.ConfigSection)
	}
	if len(m.Permissions.Env.Read) == 0 {
		t.Errorf("Permissions.Env.Read is empty, want non-empty")
	}
}

func TestLoadPluginManifest_RejectsServiceSchema(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "manifest.json")
	body := `{"schema":"kb.service/1","id":"@kb-labs/gateway"}`
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	if _, err := LoadPluginManifest(path); err == nil {
		t.Fatal("expected error for non-plugin schema, got nil")
	}
}

func TestLoadPluginManifest_MissingFile(t *testing.T) {
	if _, err := LoadPluginManifest(filepath.Join(t.TempDir(), "nope.json")); err == nil {
		t.Fatal("expected error for missing file, got nil")
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
