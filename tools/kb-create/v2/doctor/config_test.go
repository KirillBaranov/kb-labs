package doctor

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestApplyDefaultsWritesOnlyDeclaredSafeValues(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, ".kb"), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".kb", "kb.config.jsonc"), []byte(`{"platform":{}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	plan := RepairPlan{SafeDefaults: []Finding{{Path: "/platform/mode", Default: []byte(`"safe"`)}}}
	if err := ApplyDefaults(root, plan); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(root, ".kb", "kb.config.jsonc"))
	if err != nil || !strings.Contains(string(data), `"mode": "safe"`) {
		t.Fatalf("config/error = %s / %v", data, err)
	}
}

func TestApplyDefaultsRejectsMissingDefault(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, ".kb"), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".kb", "kb.config.jsonc"), []byte(`{}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := ApplyDefaults(root, RepairPlan{SafeDefaults: []Finding{{Path: "/x"}}}); err == nil {
		t.Fatal("expected default decode failure")
	}
}
