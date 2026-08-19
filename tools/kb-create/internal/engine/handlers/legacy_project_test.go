package handlers

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kb-labs/create/internal/engine/config"
)

func TestMigrateLegacyProjectConfigPreservesUserFieldsAndRetiresJSON(t *testing.T) {
	project := t.TempDir()
	kbDir := filepath.Join(project, ".kb")
	if err := os.MkdirAll(kbDir, 0o750); err != nil {
		t.Fatal(err)
	}
	legacyPath := filepath.Join(kbDir, "kb.config.json")
	legacy := `{"platform":{"dir":"/old"},"userSettings":{"keep":true},"gateway":{"upstreams":{"missing":{"serviceId":"missing","prefix":"/missing"},"rest":{"serviceId":"rest","prefix":"/api"},"duplicate":{"serviceId":"rest","prefix":"/api"}}}}`
	if err := os.WriteFile(legacyPath, []byte(legacy), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(kbDir, "kb.config.jsonc"), []byte(`{"platform":{"dir":"/new"}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	assembly := config.ConfigAssembly{Patches: []config.ConfigPatch{{ID: "rest", Scope: config.ScopePlatform, Operation: config.OperationSet, Path: "/services/rest", Value: json.RawMessage(`true`), Owner: "test"}}}
	if err := migrateLegacyProjectConfig(assembly, config.Roots{config.RootProject: project}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(legacyPath); !os.IsNotExist(err) {
		t.Fatalf("legacy config still exists: %v", err)
	}
	backups, err := filepath.Glob(legacyPath + ".bak-*")
	if err != nil || len(backups) != 1 {
		t.Fatalf("backups = %v, %v", backups, err)
	}
	data, err := os.ReadFile(filepath.Join(kbDir, "kb.config.jsonc"))
	if err != nil {
		t.Fatal(err)
	}
	content := string(data)
	for _, want := range []string{`"keep": true`, `"dir": "/new"`} {
		if !strings.Contains(content, want) {
			t.Errorf("migrated config missing %s:\n%s", want, content)
		}
	}
	if strings.Contains(content, `"missing"`) || strings.Count(content, `"prefix": "/api"`) != 1 {
		t.Errorf("routes were not reconciled:\n%s", content)
	}
}
