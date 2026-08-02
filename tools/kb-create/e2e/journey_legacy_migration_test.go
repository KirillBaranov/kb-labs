package e2e

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestLegacyProjectMigrationJourney exercises the failure-prone upgrade path
// as a user sees it: an existing project with the old JSON config is installed
// into a fresh platform. The installer must preserve user data, back up the
// original file, and remove routes for services that are not installed.
func TestLegacyProjectMigrationJourney(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	bin := binary(t)
	platformDir := t.TempDir()
	projectDir := t.TempDir()
	mustGit(t, projectDir, "init")
	mustGit(t, projectDir, "commit", "--allow-empty", "-m", "init")

	kbDir := filepath.Join(projectDir, ".kb")
	if err := os.MkdirAll(kbDir, 0o750); err != nil {
		t.Fatal(err)
	}
	legacy := map[string]any{
		"platform":     map[string]any{"dir": "/old/platform"},
		"userSettings": map[string]any{"keep": true},
		"gateway": map[string]any{"upstreams": map[string]any{
			"marketplace-registry": map[string]any{"serviceId": "missing-service", "prefix": "/registry"},
			"rest":                 map[string]any{"serviceId": "rest", "prefix": "/api/v1"},
			"legacy-alias":         map[string]any{"serviceId": "rest", "prefix": "/api/v1"},
		}},
	}
	legacyData, err := json.Marshal(legacy)
	if err != nil {
		t.Fatal(err)
	}
	legacyPath := filepath.Join(kbDir, "kb.config.json")
	if err := os.WriteFile(legacyPath, legacyData, 0o644); err != nil {
		t.Fatal(err)
	}

	out, code := run(t, bin, projectDir, "--yes", "--local", "--platform", platformDir)
	if code != 0 {
		t.Fatalf("legacy install exited %d:\n%s", code, out)
	}

	projectConfigPath := filepath.Join(kbDir, "kb.config.jsonc")
	projectConfig, err := os.ReadFile(projectConfigPath)
	if err != nil {
		t.Fatalf("migrated project config missing: %v", err)
	}
	content := string(projectConfig)
	if !strings.Contains(content, `"keep": true`) {
		t.Errorf("user-owned fields were lost during migration:\n%s", content)
	}
	if strings.Contains(content, "marketplace-registry") || strings.Contains(content, `"/registry"`) {
		t.Errorf("stale route survived migration:\n%s", content)
	}
	if strings.Count(content, `"prefix": "/api/v1"`) != 1 {
		t.Errorf("duplicate route survived migration:\n%s", content)
	}
	if _, err := os.Stat(legacyPath); !os.IsNotExist(err) {
		t.Errorf("legacy JSON was not retired: %v", err)
	}
	backups, err := filepath.Glob(legacyPath + ".bak-*")
	if err != nil || len(backups) != 1 {
		t.Fatalf("expected exactly one legacy backup, got %v (%v)", backups, err)
	}
}
