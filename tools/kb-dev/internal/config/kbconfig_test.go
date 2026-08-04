package config

import (
	"os"
	"path/filepath"
	"testing"
)

// fixtureKBConfig mirrors the shape kb-create's scaffold.generateFull
// actually renders — two things about it broke early, production versions of
// the readers in this package, and every test using this fixture guards
// against both regressing:
//   - a "url" field containing "http://": a naive "//" comment stripper
//     truncates the URL's "//" and everything after it on that line,
//     corrupting the JSON.
//   - a trailing comma before a closing "}" (kb-create's generator always
//     leaves one between adjacent sections): plain json.Unmarshal rejects it
//     unless stripped first, same as kb-create's own reader does.
const fixtureKBConfig = `{
  // ─── Platform ──────────────────────────────────────────────────────────
  "platform": {
    "dir": "/Users/x/kb-platform"
  },

  "adapterOptions": {
    "serviceTransport": {
      "services": {
        "rest": {"url":"http://127.0.0.1:5050"}
      }
    }
  },

  // ─── Projects ─────────────────────────────────────────────────────────
  // Registry of known local projects (alias -> absolute path).
  "projects": {
    // kb-dev:projects:start
    "dit-1": "/Users/x/dit-1",
    "figma-map": "/Users/x/figma-map"
    // kb-dev:projects:end
  }
}
`

func writeFixtureKBConfig(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()
	kbDir := filepath.Join(dir, ".kb")
	if err := os.MkdirAll(kbDir, 0o750); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(kbDir, "kb.config.jsonc")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestReadProjects(t *testing.T) {
	platformDir := writeFixtureKBConfig(t, fixtureKBConfig)

	projects, err := ReadProjects(platformDir)
	if err != nil {
		t.Fatalf("ReadProjects: %v", err)
	}

	want := map[string]string{
		"dit-1":     "/Users/x/dit-1",
		"figma-map": "/Users/x/figma-map",
	}
	if len(projects) != len(want) {
		t.Fatalf("got %d projects, want %d: %v", len(projects), len(want), projects)
	}
	for alias, path := range want {
		if projects[alias] != path {
			t.Errorf("projects[%q] = %q, want %q", alias, projects[alias], path)
		}
	}
}

func TestReadProjects_noFile(t *testing.T) {
	dir := t.TempDir()
	projects, err := ReadProjects(dir)
	if err != nil {
		t.Fatalf("ReadProjects on missing file: %v", err)
	}
	if len(projects) != 0 {
		t.Fatalf("expected empty map, got %v", projects)
	}
}

func TestWriteProjects_roundTrip(t *testing.T) {
	platformDir := writeFixtureKBConfig(t, fixtureKBConfig)

	updated := map[string]string{
		"dit-1":     "/Users/x/dit-1",
		"figma-map": "/Users/x/figma-map",
		"new-alias": "/Users/x/new-project",
	}
	if err := WriteProjects(platformDir, updated); err != nil {
		t.Fatalf("WriteProjects: %v", err)
	}

	got, err := ReadProjects(platformDir)
	if err != nil {
		t.Fatalf("ReadProjects after write: %v", err)
	}
	if len(got) != len(updated) {
		t.Fatalf("got %d projects, want %d: %v", len(got), len(updated), got)
	}
	for alias, path := range updated {
		if got[alias] != path {
			t.Errorf("projects[%q] = %q, want %q", alias, got[alias], path)
		}
	}

	// The platform.dir field and surrounding comments must survive untouched —
	// WriteProjects only splices the sentinel-bounded block.
	raw, err := os.ReadFile(filepath.Join(platformDir, ".kb", "kb.config.jsonc"))
	if err != nil {
		t.Fatal(err)
	}
	if dir := extractPlatformDir(raw); dir != "/Users/x/kb-platform" {
		t.Errorf("platform.dir corrupted by WriteProjects: got %q", dir)
	}
}

func TestWriteProjects_removeAlias(t *testing.T) {
	platformDir := writeFixtureKBConfig(t, fixtureKBConfig)

	if err := WriteProjects(platformDir, map[string]string{"dit-1": "/Users/x/dit-1"}); err != nil {
		t.Fatalf("WriteProjects: %v", err)
	}

	got, err := ReadProjects(platformDir)
	if err != nil {
		t.Fatalf("ReadProjects: %v", err)
	}
	if _, ok := got["figma-map"]; ok {
		t.Errorf("expected figma-map removed, still present: %v", got)
	}
	if got["dit-1"] != "/Users/x/dit-1" {
		t.Errorf("dit-1 = %q, want /Users/x/dit-1", got["dit-1"])
	}
}

func TestWriteProjects_noBlock(t *testing.T) {
	platformDir := writeFixtureKBConfig(t, `{"platform": {"dir": "/x"}}`)

	err := WriteProjects(platformDir, map[string]string{"a": "/a"})
	if err == nil {
		t.Fatal("expected error for kb.config.jsonc without a projects block")
	}
}

func TestWriteProjects_declarativeJSON(t *testing.T) {
	platformDir := writeFixtureKBConfig(t, `{"platform": {"dir": "/x"}, "projects": {}}`)

	if err := WriteProjects(platformDir, map[string]string{"a": "/a"}); err != nil {
		t.Fatalf("WriteProjects declarative JSON: %v", err)
	}
	projects, err := ReadProjects(platformDir)
	if err != nil {
		t.Fatalf("ReadProjects declarative JSON: %v", err)
	}
	if projects["a"] != "/a" {
		t.Fatalf("projects[a] = %q, want /a", projects["a"])
	}
}

func writeProjectKBConfigJSON(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()
	kbDir := filepath.Join(dir, ".kb")
	if err := os.MkdirAll(kbDir, 0o750); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(kbDir, "kb.config.json")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestReadDevSwitchAutoHook_true(t *testing.T) {
	projectDir := writeProjectKBConfigJSON(t, `{"devSwitch": {"autoHook": true}}`)
	if !ReadDevSwitchAutoHook(projectDir) {
		t.Error("expected true")
	}
}

func TestReadDevSwitchAutoHook_falseExplicit(t *testing.T) {
	projectDir := writeProjectKBConfigJSON(t, `{"devSwitch": {"autoHook": false}}`)
	if ReadDevSwitchAutoHook(projectDir) {
		t.Error("expected false")
	}
}

func TestReadDevSwitchAutoHook_absentField(t *testing.T) {
	projectDir := writeProjectKBConfigJSON(t, `{"gateway": {"host": "127.0.0.1"}}`)
	if ReadDevSwitchAutoHook(projectDir) {
		t.Error("expected false when devSwitch is absent — opt-in by construction")
	}
}

func TestReadDevSwitchAutoHook_absentFile(t *testing.T) {
	dir := t.TempDir() // no .kb/kb.config.json at all
	if ReadDevSwitchAutoHook(dir) {
		t.Error("expected false when kb.config.json doesn't exist")
	}
}

func TestReadDevSwitchAutoHook_malformedJSON(t *testing.T) {
	projectDir := writeProjectKBConfigJSON(t, `{not valid json`)
	if ReadDevSwitchAutoHook(projectDir) {
		t.Error("expected false on malformed JSON, not a panic or true")
	}
}
