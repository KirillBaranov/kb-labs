package validate

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeTempJSON(t *testing.T, dir, name string, v any) string {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal fixture: %v", err)
	}
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	return path
}

func TestValidate_NoLock_KnownSlotsPass(t *testing.T) {
	cfg := &Config{}
	cfg.Platform.Adapters = map[string]json.RawMessage{
		"logger": json.RawMessage(`"@kb-labs/adapters-pino"`),
		"cache":  json.RawMessage(`"@kb-labs/adapters-redis"`),
	}

	result := Validate(cfg, nil, "cfg.json", "")

	if result.HasErrors() {
		t.Fatalf("expected no errors, got %+v", result.Findings)
	}
}

func TestValidate_UnknownSlot_Errors(t *testing.T) {
	cfg := &Config{}
	cfg.Platform.Adapters = map[string]json.RawMessage{
		"logg3r": json.RawMessage(`"@kb-labs/adapters-pino"`),
	}

	result := Validate(cfg, nil, "cfg.json", "")

	if !result.HasErrors() {
		t.Fatal("expected an error for unrecognized slot")
	}
	found := false
	for _, f := range result.Findings {
		if f.Slot == "logg3r" && f.Severity == "error" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected an error finding for slot %q, got %+v", "logg3r", result.Findings)
	}
}

func TestValidate_LockCrossCheck_MissingPackage(t *testing.T) {
	cfg := &Config{}
	cfg.Platform.Adapters = map[string]json.RawMessage{
		"storage": json.RawMessage(`"@kb-labs/adapters-diskio"`),
	}
	lock := &Lock{
		Schema:    "kb.marketplace/2",
		Installed: map[string]json.RawMessage{
			// deliberately missing "@kb-labs/adapters-diskio" — the PR #328 case
		},
	}

	result := Validate(cfg, lock, "cfg.json", "lock.json")

	if !result.HasErrors() {
		t.Fatal("expected an error for an adapter package missing from the lock")
	}
	if !strings.Contains(result.Findings[0].Message, "@kb-labs/adapters-diskio") {
		t.Errorf("expected finding to name the missing package, got %q", result.Findings[0].Message)
	}
}

func TestValidate_LockCrossCheck_PresentPackage(t *testing.T) {
	cfg := &Config{}
	cfg.Platform.Adapters = map[string]json.RawMessage{
		"cache": json.RawMessage(`"@kb-labs/adapters-redis"`),
	}
	lock := &Lock{
		Schema: "kb.marketplace/2",
		Installed: map[string]json.RawMessage{
			"@kb-labs/adapters-redis": json.RawMessage(`{"version":"0.8.0"}`),
		},
	}

	result := Validate(cfg, lock, "cfg.json", "lock.json")

	if result.HasErrors() {
		t.Fatalf("expected no errors, got %+v", result.Findings)
	}
}

func TestValidate_SubpathAdapter_ChecksBasePackage(t *testing.T) {
	cfg := &Config{}
	cfg.Platform.Adapters = map[string]json.RawMessage{
		"kvStore": json.RawMessage(`"@kb-labs/adapters-sqlite/kv"`),
	}
	lock := &Lock{
		Schema: "kb.marketplace/2",
		Installed: map[string]json.RawMessage{
			// lock records the base package, not the subpath — this must resolve.
			"@kb-labs/adapters-sqlite": json.RawMessage(`{"version":"0.8.0"}`),
		},
	}

	result := Validate(cfg, lock, "cfg.json", "lock.json")

	if result.HasErrors() {
		t.Fatalf("expected the subpath adapter to resolve against its base package, got %+v", result.Findings)
	}
}

func TestValidate_MultiAdapterArray(t *testing.T) {
	cfg := &Config{}
	cfg.Platform.Adapters = map[string]json.RawMessage{
		"llm": json.RawMessage(`["@kb-labs/adapters-openai", "@kb-labs/adapters-anthropic"]`),
	}
	lock := &Lock{
		Schema: "kb.marketplace/2",
		Installed: map[string]json.RawMessage{
			"@kb-labs/adapters-openai": json.RawMessage(`{"version":"0.8.0"}`),
			// "@kb-labs/adapters-anthropic" deliberately absent
		},
	}

	result := Validate(cfg, lock, "cfg.json", "lock.json")

	if !result.HasErrors() {
		t.Fatal("expected an error for the second array entry missing from the lock")
	}
}

func TestReadConfig_RoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := writeTempJSON(t, dir, "kb.config.json", map[string]any{
		"platform": map[string]any{
			"adapters": map[string]any{
				"cache": "@kb-labs/adapters-redis",
			},
		},
	})

	cfg, err := ReadConfig(path)
	if err != nil {
		t.Fatalf("ReadConfig: %v", err)
	}
	if _, ok := cfg.Platform.Adapters["cache"]; !ok {
		t.Errorf("expected 'cache' adapter to be present, got %+v", cfg.Platform.Adapters)
	}
}

func TestReadConfig_MissingFile(t *testing.T) {
	if _, err := ReadConfig("/nonexistent/kb.config.json"); err == nil {
		t.Fatal("expected an error for a missing file")
	}
}

func TestReadLock_RoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := writeTempJSON(t, dir, "marketplace.lock", Lock{
		Schema: "kb.marketplace/2",
		Installed: map[string]json.RawMessage{
			"@kb-labs/adapters-redis": json.RawMessage(`{"version":"0.8.0"}`),
		},
	})

	lock, err := ReadLock(path)
	if err != nil {
		t.Fatalf("ReadLock: %v", err)
	}
	if _, ok := lock.Installed["@kb-labs/adapters-redis"]; !ok {
		t.Errorf("expected '@kb-labs/adapters-redis' entry, got %+v", lock.Installed)
	}
}

func TestBasePackageName(t *testing.T) {
	cases := map[string]string{
		"@kb-labs/adapters-openai/embeddings": "@kb-labs/adapters-openai",
		"@kb-labs/adapters-openai":            "@kb-labs/adapters-openai",
		"left-pad/foo":                        "left-pad",
		"left-pad":                            "left-pad",
	}
	for in, want := range cases {
		if got := basePackageName(in); got != want {
			t.Errorf("basePackageName(%q) = %q, want %q", in, got, want)
		}
	}
}
