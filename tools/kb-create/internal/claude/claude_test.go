package claude

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// fixture builds a self-contained devkit assets directory inside a temp dir
// and returns its path. It is the testing equivalent of
// node_modules/@kb-labs/devkit/assets/claude.
func writeAssetsFixture(t *testing.T, devkitVersion string, skills map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	assetsDir := filepath.Join(dir, "assets", "claude")
	if err := os.MkdirAll(filepath.Join(assetsDir, "skills"), 0o755); err != nil {
		t.Fatal(err)
	}

	specs := make([]map[string]string, 0, len(skills))
	for id, body := range skills {
		skillDir := filepath.Join(assetsDir, "skills", id)
		if err := os.MkdirAll(skillDir, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
		specs = append(specs, map[string]string{
			"id":          id,
			"path":        filepath.ToSlash(filepath.Join("skills", id, "SKILL.md")),
			"version":     "1.0.0",
			"description": "test skill " + id,
		})
	}

	if err := os.WriteFile(filepath.Join(assetsDir, "CLAUDE.md.snippet"), []byte("## KB Labs Test\n\nbody line\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	manifest := map[string]any{
		"schemaVersion":  1,
		"devkitVersion":  devkitVersion,
		"platformCompat": ">=0.10.0 <2.0.0",
		"claudeMd": map[string]string{
			"snippetPath": "CLAUDE.md.snippet",
			"markerId":    "kb-labs",
		},
		"skills": specs,
	}
	data, _ := json.MarshalIndent(manifest, "", "  ")
	if err := os.WriteFile(filepath.Join(assetsDir, "manifest.json"), data, 0o644); err != nil {
		t.Fatal(err)
	}
	return assetsDir
}

// platformWithDevkit creates a fake platform dir whose node_modules layout
// matches what kb-create produces after `npm install`. The returned path is
// the platform root.
func platformWithDevkit(t *testing.T, assetsDir string) string {
	t.Helper()
	platformDir := t.TempDir()
	devkitDir := filepath.Join(platformDir, devkitAssetsRelPath)
	if err := os.MkdirAll(devkitDir, 0o755); err != nil {
		t.Fatal(err)
	}
	// Copy assets fixture into the fake platform's devkit assets path.
	if err := copyDir(assetsDir, devkitDir); err != nil {
		t.Fatal(err)
	}
	return platformDir
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, path)
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		data, err := os.ReadFile(path) // #nosec G304 -- test fixture path
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, 0o644)
	})
}

// ── ResolveAssetsDir ────────────────────────────────────────────────────────

func TestResolveAssetsDir_NotFound(t *testing.T) {
	dir := t.TempDir()
	_, err := ResolveAssetsDir(dir, "")
	if err == nil {
		t.Fatal("expected error when assets are missing")
	}
	if err != ErrAssetsNotFound {
		t.Fatalf("expected ErrAssetsNotFound, got %v", err)
	}
}

func TestResolveAssetsDir_FoundInPlatform(t *testing.T) {
	assetsDir := writeAssetsFixture(t, "1.5.0", map[string]string{"kb-labs-quickstart": "body"})
	platform := platformWithDevkit(t, assetsDir)

	resolved, err := ResolveAssetsDir(platform, "")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(resolved, "@kb-labs/devkit/assets/claude") {
		t.Fatalf("unexpected path: %s", resolved)
	}
}

// ── ReadManifest ────────────────────────────────────────────────────────────

func TestReadManifest_RejectsNonKbLabsSkillID(t *testing.T) {
	assetsDir := writeAssetsFixture(t, "1.5.0", map[string]string{"my-own-skill": "body"})
	_, err := ReadManifest(assetsDir)
	if err == nil {
		t.Fatal("expected manifest to reject non-namespaced skill ids")
	}
}

func TestReadManifest_HappyPath(t *testing.T) {
	assetsDir := writeAssetsFixture(t, "1.5.0", map[string]string{
		"kb-labs-quickstart":    "a",
		"kb-labs-create-plugin": "b",
	})
	m, err := ReadManifest(assetsDir)
	if err != nil {
		t.Fatal(err)
	}
	if m.DevkitVersion != "1.5.0" {
		t.Fatalf("unexpected devkit version: %s", m.DevkitVersion)
	}
	if len(m.Skills) != 2 {
		t.Fatalf("expected 2 skills, got %d", len(m.Skills))
	}
}

// ── State round-trip ────────────────────────────────────────────────────────

func TestState_RoundTrip(t *testing.T) {
	dir := t.TempDir()
	want := &State{
		SchemaVersion: 1,
		DevkitVersion: "1.5.0",
		Skills: []SkillState{
			{ID: "kb-labs-quickstart", Version: "1.0.0", SHA256: "abc"},
		},
		ClaudeMd: ClaudeMdState{Managed: true, MarkerID: "kb-labs", CreatedFile: true},
	}
	if err := WriteState(dir, want); err != nil {
		t.Fatal(err)
	}
	got, err := ReadState(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got == nil || got.DevkitVersion != "1.5.0" || len(got.Skills) != 1 {
		t.Fatalf("unexpected state: %+v", got)
	}
	if found := got.FindSkill("kb-labs-quickstart"); found == nil || found.SHA256 != "abc" {
		t.Fatalf("FindSkill broken: %+v", found)
	}
}

func TestReadState_MissingIsNil(t *testing.T) {
	dir := t.TempDir()
	s, err := ReadState(dir)
	if err != nil {
		t.Fatal(err)
	}
	if s != nil {
		t.Fatalf("expected nil state for fresh project, got %+v", s)
	}
}

// ── Install: clean project ──────────────────────────────────────────────────

func TestInstall_CleanProject(t *testing.T) {
	assetsDir := writeAssetsFixture(t, "1.5.0", map[string]string{
		"kb-labs-quickstart":    "quickstart body",
		"kb-labs-create-plugin": "plugin body",
	})
	platform := platformWithDevkit(t, assetsDir)
	project := t.TempDir()

	res, err := Install(Options{
		ProjectDir:  project,
		PlatformDir: platform,
		Yes:         true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.SkillsAdded) != 2 || len(res.SkillsUpdated) != 0 {
		t.Fatalf("expected 2 added 0 updated, got %+v", res)
	}
	if res.ClaudeMdAction != "created" {
		t.Fatalf("expected CLAUDE.md created, got %s", res.ClaudeMdAction)
	}

	for _, id := range []string{"kb-labs-quickstart", "kb-labs-create-plugin"} {
		path := filepath.Join(project, ".claude", "skills", id, "SKILL.md")
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("expected skill at %s: %v", path, err)
		}
	}

	mdBytes, err := os.ReadFile(filepath.Join(project, "CLAUDE.md"))
	if err != nil {
		t.Fatal(err)
	}
	md := string(mdBytes)
	if !strings.Contains(md, "<!-- BEGIN: KB Labs v1.5.0") {
		t.Fatalf("CLAUDE.md missing BEGIN marker:\n%s", md)
	}
	if !strings.Contains(md, "<!-- END: KB Labs (managed) -->") {
		t.Fatalf("CLAUDE.md missing END marker:\n%s", md)
	}

	state, err := ReadState(project)
	if err != nil || state == nil {
		t.Fatalf("state not written: %v", err)
	}
	if !state.ClaudeMd.CreatedFile {
		t.Fatal("expected createdFile=true")
	}
	if state.DevkitVersion != "1.5.0" {
		t.Fatalf("unexpected state version: %s", state.DevkitVersion)
	}
}

// ── Install: existing CLAUDE.md without markers, --yes ──────────────────────

func TestInstall_AppendsToExistingClaudeMd(t *testing.T) {
	assetsDir := writeAssetsFixture(t, "1.5.0", map[string]string{
		"kb-labs-quickstart": "body",
	})
	platform := platformWithDevkit(t, assetsDir)
	project := t.TempDir()

	userContent := "# My Project\n\nMy own notes for Claude.\n"
	if err := os.WriteFile(filepath.Join(project, "CLAUDE.md"), []byte(userContent), 0o644); err != nil {
		t.Fatal(err)
	}

	res, err := Install(Options{ProjectDir: project, PlatformDir: platform, Yes: true})
	if err != nil {
		t.Fatal(err)
	}
	if res.ClaudeMdAction != "merged" {
		t.Fatalf("expected merged, got %s", res.ClaudeMdAction)
	}

	merged, _ := os.ReadFile(filepath.Join(project, "CLAUDE.md"))
	mergedStr := string(merged)
	if !strings.Contains(mergedStr, "My own notes for Claude.") {
		t.Fatal("user content lost")
	}
	if !strings.Contains(mergedStr, "<!-- BEGIN: KB Labs v1.5.0") {
		t.Fatal("managed section not appended")
	}
	if !strings.HasPrefix(mergedStr, "# My Project") {
		t.Fatal("user content moved away from the top")
	}

	state, _ := ReadState(project)
	if state.ClaudeMd.CreatedFile {
		t.Fatal("expected createdFile=false (we did not create the file)")
	}
}

// ── Update: replace marked section in place, version bump ───────────────────

func TestUpdate_ReplacesMarkedSectionInPlace(t *testing.T) {
	v1Assets := writeAssetsFixture(t, "1.0.0", map[string]string{
		"kb-labs-quickstart": "v1 body",
	})
	platform := platformWithDevkit(t, v1Assets)
	project := t.TempDir()

	if _, err := Install(Options{ProjectDir: project, PlatformDir: platform, Yes: true}); err != nil {
		t.Fatal(err)
	}

	mdBefore, _ := os.ReadFile(filepath.Join(project, "CLAUDE.md"))
	if !strings.Contains(string(mdBefore), "v1.0.0") {
		t.Fatalf("expected v1.0.0 marker, got %s", mdBefore)
	}

	// Build a v1.5.0 fixture into the SAME platform (simulates bump).
	v2Assets := writeAssetsFixture(t, "1.5.0", map[string]string{
		"kb-labs-quickstart":    "v2 body",
		"kb-labs-create-plugin": "new plugin body",
	})
	devkitDir := filepath.Join(platform, devkitAssetsRelPath)
	if err := os.RemoveAll(devkitDir); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(devkitDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := copyDir(v2Assets, devkitDir); err != nil {
		t.Fatal(err)
	}

	// Seed unrelated user content around the managed section.
	mdPath := filepath.Join(project, "CLAUDE.md")
	mdBytes, _ := os.ReadFile(mdPath)
	withUser := "# Project\n\nuser intro\n\n" + string(mdBytes) + "\nuser footer\n"
	if err := os.WriteFile(mdPath, []byte(withUser), 0o644); err != nil {
		t.Fatal(err)
	}

	res, err := Update(Options{ProjectDir: project, PlatformDir: platform, Yes: true})
	if err != nil {
		t.Fatal(err)
	}
	if res.ClaudeMdAction != "updated" {
		t.Fatalf("expected updated, got %s", res.ClaudeMdAction)
	}
	if len(res.SkillsAdded) != 1 || len(res.SkillsUpdated) != 1 {
		t.Fatalf("expected 1 added 1 updated, got %+v", res)
	}

	final, _ := os.ReadFile(mdPath)
	finalStr := string(final)
	if !strings.Contains(finalStr, "v1.5.0") {
		t.Fatalf("expected v1.5.0 marker after update:\n%s", finalStr)
	}
	if strings.Contains(finalStr, "v1.0.0 (managed") {
		t.Fatalf("old version marker still present:\n%s", finalStr)
	}
	if !strings.Contains(finalStr, "user intro") || !strings.Contains(finalStr, "user footer") {
		t.Fatalf("user content damaged:\n%s", finalStr)
	}
}

// ── Install: --skip-claude leaves CLAUDE.md untouched ───────────────────────

func TestInstall_SkipClaudeMd(t *testing.T) {
	assetsDir := writeAssetsFixture(t, "1.5.0", map[string]string{"kb-labs-quickstart": "body"})
	platform := platformWithDevkit(t, assetsDir)
	project := t.TempDir()

	res, err := Install(Options{ProjectDir: project, PlatformDir: platform, Yes: true, SkipClaudeMd: true})
	if err != nil {
		t.Fatal(err)
	}
	if res.ClaudeMdAction != "skipped" {
		t.Fatalf("expected skipped, got %s", res.ClaudeMdAction)
	}
	if _, err := os.Stat(filepath.Join(project, "CLAUDE.md")); !os.IsNotExist(err) {
		t.Fatal("CLAUDE.md should not have been created")
	}
	if _, err := os.Stat(filepath.Join(project, ".claude", "skills", "kb-labs-quickstart", "SKILL.md")); err != nil {
		t.Fatalf("skill should still be installed: %v", err)
	}
}

// ── Install: refusing prompter without --yes leaves CLAUDE.md alone ─────────

type denyingPrompter struct{}

func (denyingPrompter) ConfirmAddClaudeMd(string) PromptResponse { return ResponseNo }

func TestInstall_DeniedPrompterPreservesUserClaudeMd(t *testing.T) {
	assetsDir := writeAssetsFixture(t, "1.5.0", map[string]string{"kb-labs-quickstart": "body"})
	platform := platformWithDevkit(t, assetsDir)
	project := t.TempDir()

	original := "# Mine\n\nleave me alone\n"
	if err := os.WriteFile(filepath.Join(project, "CLAUDE.md"), []byte(original), 0o644); err != nil {
		t.Fatal(err)
	}

	res, err := Install(Options{
		ProjectDir:  project,
		PlatformDir: platform,
		Prompter:    denyingPrompter{},
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.ClaudeMdAction != "skipped" {
		t.Fatalf("expected skipped, got %s", res.ClaudeMdAction)
	}
	got, _ := os.ReadFile(filepath.Join(project, "CLAUDE.md"))
	if string(got) != original {
		t.Fatalf("CLAUDE.md was modified:\n%s", got)
	}
}

// ── Uninstall: removes only kb-labs-* skills, strips marked section ────────

func TestUninstall_KeepsUserAssets(t *testing.T) {
	assetsDir := writeAssetsFixture(t, "1.5.0", map[string]string{
		"kb-labs-quickstart": "body",
	})
	platform := platformWithDevkit(t, assetsDir)
	project := t.TempDir()

	if _, err := Install(Options{ProjectDir: project, PlatformDir: platform, Yes: true}); err != nil {
		t.Fatal(err)
	}

	// User-authored skill that must survive uninstall.
	userSkillDir := filepath.Join(project, ".claude", "skills", "my-own")
	if err := os.MkdirAll(userSkillDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(userSkillDir, "SKILL.md"), []byte("mine"), 0o644); err != nil {
		t.Fatal(err)
	}

	res, err := Uninstall(Options{ProjectDir: project, PlatformDir: platform, Yes: true})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.SkillsRemoved) != 1 || res.SkillsRemoved[0] != "kb-labs-quickstart" {
		t.Fatalf("unexpected removed skills: %+v", res.SkillsRemoved)
	}

	if _, err := os.Stat(filepath.Join(project, ".claude", "skills", "kb-labs-quickstart")); !os.IsNotExist(err) {
		t.Fatal("kb-labs skill should be gone")
	}
	if _, err := os.Stat(userSkillDir); err != nil {
		t.Fatal("user skill should survive")
	}

	// Since createdFile==true and we leave only "# CLAUDE.md", file is removed.
	if _, err := os.Stat(filepath.Join(project, "CLAUDE.md")); !os.IsNotExist(err) {
		t.Fatal("kb-create created CLAUDE.md, so uninstall should remove it")
	}
	if _, err := os.Stat(filepath.Join(project, ".claude", ".kb-labs.json")); !os.IsNotExist(err) {
		t.Fatal("state file should be removed")
	}
}

// ── Uninstall: preserves user-owned CLAUDE.md, only strips section ──────────

func TestUninstall_PreservesUserClaudeMd(t *testing.T) {
	assetsDir := writeAssetsFixture(t, "1.5.0", map[string]string{
		"kb-labs-quickstart": "body",
	})
	platform := platformWithDevkit(t, assetsDir)
	project := t.TempDir()

	original := "# Mine\n\nuser intro\n"
	if err := os.WriteFile(filepath.Join(project, "CLAUDE.md"), []byte(original), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := Install(Options{ProjectDir: project, PlatformDir: platform, Yes: true}); err != nil {
		t.Fatal(err)
	}

	if _, err := Uninstall(Options{ProjectDir: project, PlatformDir: platform, Yes: true}); err != nil {
		t.Fatal(err)
	}

	got, err := os.ReadFile(filepath.Join(project, "CLAUDE.md"))
	if err != nil {
		t.Fatalf("CLAUDE.md should still exist: %v", err)
	}
	if !strings.Contains(string(got), "user intro") {
		t.Fatalf("user content lost:\n%s", got)
	}
	if strings.Contains(string(got), "BEGIN: KB Labs") {
		t.Fatalf("managed section not stripped:\n%s", got)
	}
}

// ── Install: missing assets returns sentinel without panicking ──────────────

func TestInstall_MissingAssets(t *testing.T) {
	platform := t.TempDir()
	project := t.TempDir()
	_, err := Install(Options{ProjectDir: project, PlatformDir: platform})
	if err != ErrAssetsNotFound {
		t.Fatalf("expected ErrAssetsNotFound, got %v", err)
	}
	// Project must remain untouched.
	if _, err := os.Stat(filepath.Join(project, ".claude")); !os.IsNotExist(err) {
		t.Fatal(".claude should not exist when assets missing")
	}
}
