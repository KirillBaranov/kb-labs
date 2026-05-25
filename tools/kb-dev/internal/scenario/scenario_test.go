package scenario

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

// writeScenario writes a scenario.yaml + overlay files into a fresh tmpdir
// and returns the path to scenario.yaml.
func writeScenario(t *testing.T, yaml string, overlays map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	yamlPath := filepath.Join(dir, "scenario.yaml")
	if err := os.WriteFile(yamlPath, []byte(yaml), 0o644); err != nil {
		t.Fatalf("write yaml: %v", err)
	}
	for name, content := range overlays {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
			t.Fatalf("write overlay %s: %v", name, err)
		}
	}
	return yamlPath
}

func TestLoad_Valid(t *testing.T) {
	path := writeScenario(t,
		"name: pressure\noverlays: [overlay.jsonc]\nrestarts: [gateway]\ndomain: e2e-gateway\n",
		map[string]string{"overlay.jsonc": `{"adapters":{}}`},
	)
	s, err := Load(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s.Name != "pressure" {
		t.Errorf("name: got %q want pressure", s.Name)
	}
	if got := s.Overlays; len(got) != 1 || got[0] != "overlay.jsonc" {
		t.Errorf("overlays: got %v", got)
	}
	if got := s.Restarts; len(got) != 1 || got[0] != "gateway" {
		t.Errorf("restarts: got %v", got)
	}
	if s.Domain != "e2e-gateway" {
		t.Errorf("domain: got %q", s.Domain)
	}
	if !strings.HasSuffix(s.BaseDir(), filepath.Dir(path)[len(filepath.Dir(filepath.Dir(path))):]) {
		// loose check that baseDir points to scenario dir
		t.Errorf("baseDir not set correctly: %q", s.BaseDir())
	}
}

func TestLoad_RejectsReservedName(t *testing.T) {
	path := writeScenario(t,
		"name: default\noverlays: []\nrestarts: []\n",
		nil,
	)
	if _, err := Load(path); err == nil || !strings.Contains(err.Error(), "reserved") {
		t.Errorf("expected reserved-name error, got: %v", err)
	}
}

func TestLoad_RejectsNameWithSeparator(t *testing.T) {
	path := writeScenario(t,
		"name: bad__name\noverlays: []\nrestarts: []\n",
		nil,
	)
	if _, err := Load(path); err == nil || !strings.Contains(err.Error(), "__") {
		t.Errorf("expected separator-in-name error, got: %v", err)
	}
}

func TestLoad_RejectsEmptyName(t *testing.T) {
	path := writeScenario(t, "overlays: []\n", nil)
	if _, err := Load(path); err == nil || !strings.Contains(err.Error(), "name is required") {
		t.Errorf("expected empty-name error, got: %v", err)
	}
}

func TestLoad_RejectsMissingOverlay(t *testing.T) {
	path := writeScenario(t,
		"name: x\noverlays: [missing.jsonc]\n",
		nil,
	)
	if _, err := Load(path); err == nil || !strings.Contains(err.Error(), "not found") {
		t.Errorf("expected missing-overlay error, got: %v", err)
	}
}

func TestTargetFilename(t *testing.T) {
	s := &Scenario{Name: "pressure"}
	got := s.TargetFilename("overlay.jsonc")
	if got != "pressure__overlay.jsonc" {
		t.Errorf("got %q want pressure__overlay.jsonc", got)
	}
	// Nested source paths only use the basename.
	got = s.TargetFilename("nested/dir/file.jsonc")
	if got != "pressure__file.jsonc" {
		t.Errorf("got %q want pressure__file.jsonc", got)
	}
}

func TestIsScenarioManaged(t *testing.T) {
	cases := []struct {
		name   string
		wantOk bool
		wantOw string
	}{
		{"pressure__overlay.jsonc", true, "pressure"},
		{"multi-tenant__a.jsonc", true, "multi-tenant"},
		{"plain.jsonc", false, ""},
		{"__prefixfree.jsonc", false, ""},     // empty owner
		{"pressure_underscore.jsonc", false, ""}, // single underscore
		{"pressure__overlay.json", false, ""}, // not .jsonc
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			owner, ok := IsScenarioManaged(c.name)
			if ok != c.wantOk || owner != c.wantOw {
				t.Errorf("got (%q, %v) want (%q, %v)", owner, ok, c.wantOw, c.wantOk)
			}
		})
	}
}

func TestComputeDiff_FreshApply(t *testing.T) {
	project := t.TempDir()
	scen := loadFixture(t, "pressure", map[string]string{
		"overlay.jsonc": `{"adapters":{"llm":"openai"}}`,
	}, []string{"overlay.jsonc"})

	plan, err := ComputeDiff(project, scen)
	if err != nil {
		t.Fatalf("ComputeDiff: %v", err)
	}
	if plan.IsEmpty() {
		t.Fatalf("expected non-empty plan")
	}
	if len(plan.Actions) != 1 || plan.Actions[0].Op != "write" {
		t.Errorf("unexpected actions: %+v", plan.Actions)
	}
	if plan.Actions[0].File != "pressure__overlay.jsonc" {
		t.Errorf("filename: got %q", plan.Actions[0].File)
	}
}

func TestComputeDiff_Idempotent(t *testing.T) {
	project := t.TempDir()
	scen := loadFixture(t, "pressure", map[string]string{
		"overlay.jsonc": `{"adapters":{"llm":"openai"}}`,
	}, []string{"overlay.jsonc"})

	// First apply.
	plan, err := ComputeDiff(project, scen)
	if err != nil {
		t.Fatal(err)
	}
	if err := plan.Apply(); err != nil {
		t.Fatal(err)
	}

	// Second compute should be empty.
	plan2, err := ComputeDiff(project, scen)
	if err != nil {
		t.Fatal(err)
	}
	if !plan2.IsEmpty() {
		t.Errorf("expected empty plan on re-apply, got %+v", plan2.Actions)
	}
}

func TestComputeDiff_ReplacesOtherScenario(t *testing.T) {
	project := t.TempDir()

	// Pretend an old scenario `multi-tenant` was active.
	overlaysDir := filepath.Join(project, ".kb", "overlays")
	if err := os.MkdirAll(overlaysDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(overlaysDir, "multi-tenant__old.jsonc"), []byte(`{}`), 0o644); err != nil {
		t.Fatal(err)
	}

	scen := loadFixture(t, "pressure", map[string]string{
		"overlay.jsonc": `{"x":1}`,
	}, []string{"overlay.jsonc"})

	plan, err := ComputeDiff(project, scen)
	if err != nil {
		t.Fatal(err)
	}

	ops := opSummary(plan)
	want := []string{"remove multi-tenant__old.jsonc", "write pressure__overlay.jsonc"}
	if !sliceEqual(ops, want) {
		t.Errorf("ops: got %v want %v", ops, want)
	}
}

func TestComputeDiff_PreservesUserFiles(t *testing.T) {
	project := t.TempDir()
	overlaysDir := filepath.Join(project, ".kb", "overlays")
	if err := os.MkdirAll(overlaysDir, 0o755); err != nil {
		t.Fatal(err)
	}
	// User file (no `__` infix) — must survive.
	if err := os.WriteFile(filepath.Join(overlaysDir, "user-tweak.jsonc"), []byte(`{}`), 0o644); err != nil {
		t.Fatal(err)
	}

	scen := loadFixture(t, "pressure", map[string]string{
		"overlay.jsonc": `{"x":1}`,
	}, []string{"overlay.jsonc"})

	plan, err := ComputeDiff(project, scen)
	if err != nil {
		t.Fatal(err)
	}
	for _, a := range plan.Actions {
		if a.File == "user-tweak.jsonc" {
			t.Errorf("plan should not touch user file: %+v", a)
		}
	}
	// Sanity: after Apply, the user file is still there.
	if err := plan.Apply(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(overlaysDir, "user-tweak.jsonc")); err != nil {
		t.Errorf("user file missing after Apply: %v", err)
	}
}

func TestComputeDiff_DriftedContent(t *testing.T) {
	project := t.TempDir()
	scen := loadFixture(t, "pressure", map[string]string{
		"overlay.jsonc": `{"adapters":{"llm":"openai"}}`,
	}, []string{"overlay.jsonc"})

	// Apply once.
	plan, err := ComputeDiff(project, scen)
	if err != nil {
		t.Fatal(err)
	}
	if err := plan.Apply(); err != nil {
		t.Fatal(err)
	}

	// Corrupt the applied file.
	target := filepath.Join(project, ".kb", "overlays", "pressure__overlay.jsonc")
	if err := os.WriteFile(target, []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Diff should detect drift and rewrite.
	plan2, err := ComputeDiff(project, scen)
	if err != nil {
		t.Fatal(err)
	}
	if plan2.IsEmpty() {
		t.Fatalf("expected rewrite for drifted file")
	}
	if plan2.Actions[0].Op != "write" {
		t.Errorf("expected write, got %+v", plan2.Actions[0])
	}
}

func TestComputeDiff_DefaultResetClearsScenarios(t *testing.T) {
	project := t.TempDir()
	overlaysDir := filepath.Join(project, ".kb", "overlays")
	if err := os.MkdirAll(overlaysDir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"pressure__a.jsonc", "pressure__b.jsonc", "user.jsonc"} {
		if err := os.WriteFile(filepath.Join(overlaysDir, name), []byte(`{}`), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	plan, err := ComputeDiff(project, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := plan.Apply(); err != nil {
		t.Fatal(err)
	}

	entries, err := os.ReadDir(overlaysDir)
	if err != nil {
		t.Fatal(err)
	}
	var remaining []string
	for _, e := range entries {
		remaining = append(remaining, e.Name())
	}
	sort.Strings(remaining)
	if !sliceEqual(remaining, []string{"user.jsonc"}) {
		t.Errorf("after default reset got %v, want only user.jsonc", remaining)
	}
}

// loadFixture writes a scenario.yaml + overlay files and returns the loaded Scenario.
func loadFixture(t *testing.T, name string, overlays map[string]string, overlayRefs []string) *Scenario {
	t.Helper()
	dir := t.TempDir()
	yamlBody := "name: " + name + "\noverlays:\n"
	for _, r := range overlayRefs {
		yamlBody += "  - " + r + "\n"
	}
	yamlBody += "restarts: []\n"
	yamlPath := filepath.Join(dir, "scenario.yaml")
	if err := os.WriteFile(yamlPath, []byte(yamlBody), 0o644); err != nil {
		t.Fatal(err)
	}
	for n, c := range overlays {
		if err := os.WriteFile(filepath.Join(dir, n), []byte(c), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	s, err := Load(yamlPath)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func opSummary(p *Plan) []string {
	out := make([]string, 0, len(p.Actions))
	for _, a := range p.Actions {
		out = append(out, a.Op+" "+a.File)
	}
	return out
}

func sliceEqual(a, b []string) bool {
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
