package devservices

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestLoadAdapterRoles(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "adapter-roles.json")
	body := `["logger","llm","embeddings","vectorStore","cache","storage","analytics","eventBus","config","invoke","documentDatabase","kvStore","logs","notifier","artifacts","snapshotManager"]`
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	roles, err := LoadAdapterRoles(path)
	if err != nil {
		t.Fatalf("LoadAdapterRoles: %v", err)
	}
	want := []string{"logger", "llm", "embeddings", "vectorStore", "cache", "storage",
		"analytics", "eventBus", "config", "invoke", "documentDatabase", "kvStore",
		"logs", "notifier", "artifacts", "snapshotManager"}
	if !reflect.DeepEqual(roles, want) {
		t.Errorf("roles = %v, want %v", roles, want)
	}
}

func TestLoadAdapterRoles_MissingFile(t *testing.T) {
	if _, err := LoadAdapterRoles(filepath.Join(t.TempDir(), "nope.json")); err == nil {
		t.Fatal("expected error for missing file, got nil")
	}
}

func TestLoadAdapterRoles_InvalidJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "adapter-roles.json")
	if err := os.WriteFile(path, []byte("not json"), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	if _, err := LoadAdapterRoles(path); err == nil {
		t.Fatal("expected error for invalid JSON, got nil")
	}
}
