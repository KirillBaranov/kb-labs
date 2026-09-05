package cmd

import (
	"os"
	"path/filepath"
	"testing"
)

// TestFindConfig_ExplicitConfigPreservesProjectDirWhenNotSplitTopology
// guards the pre-existing behavior: when --config is given explicitly and
// cwd has no kb.config.jsonc platform.dir pointing back at that config's
// root, ProjectDir stays RootDir(configPath) exactly as before this fix —
// the common case where the platform and the project are the same tree.
func TestFindConfig_ExplicitConfigPreservesProjectDirWhenNotSplitTopology(t *testing.T) {
	root := t.TempDir()
	configDir := filepath.Join(root, ".kb")
	if err := os.MkdirAll(configDir, 0o750); err != nil {
		t.Fatal(err)
	}
	cfgPath := filepath.Join(configDir, "devservices.yaml")
	if err := os.WriteFile(cfgPath, []byte("services: {}\n"), 0o640); err != nil {
		t.Fatal(err)
	}

	unrelatedCwd := t.TempDir()
	restoreCwd := chdir(t, unrelatedCwd)
	defer restoreCwd()

	restoreFlag := setConfigPath(cfgPath)
	defer restoreFlag()

	result, err := FindConfig()
	if err != nil {
		t.Fatalf("FindConfig: %v", err)
	}
	if result.ProjectDir != root {
		t.Fatalf("ProjectDir = %q, want %q (RootDir of --config)", result.ProjectDir, root)
	}
}

// TestFindConfig_ExplicitConfigUsesCwdForSplitPlatformProjectTopology is the
// regression guard for the bug behind "kb workflow run --workflow-id
// healthcheck" reporting "Workflow not found" against a real V2 install: a
// project whose kb.config.jsonc declares "platform.dir" pointing at a
// separate platform directory, invoked with an explicit --config pointing at
// that platform's own devservices.yaml (exactly what this repo's own
// CLAUDE.md mandates for kb-dev start/restart/ensure, and what a V2-installed
// CLI does under the hood). ProjectDir must resolve to the project (cwd), not
// the platform directory the config file happens to live in — otherwise
// KB_PROJECT_ROOT (and anything keyed off it, like the workflow daemon's
// per-project .kb/workflows discovery) points at the wrong tree.
func TestFindConfig_ExplicitConfigUsesCwdForSplitPlatformProjectTopology(t *testing.T) {
	platformRoot := t.TempDir()
	platformConfigDir := filepath.Join(platformRoot, ".kb")
	if err := os.MkdirAll(platformConfigDir, 0o750); err != nil {
		t.Fatal(err)
	}
	cfgPath := filepath.Join(platformConfigDir, "devservices.yaml")
	if err := os.WriteFile(cfgPath, []byte("services: {}\n"), 0o640); err != nil {
		t.Fatal(err)
	}

	projectRoot := t.TempDir()
	projectConfigDir := filepath.Join(projectRoot, ".kb")
	if err := os.MkdirAll(projectConfigDir, 0o750); err != nil {
		t.Fatal(err)
	}
	kbConfigJSONC := `{
  "platform": {
    "dir": ` + jsonString(platformRoot) + `
  }
}
`
	if err := os.WriteFile(filepath.Join(projectConfigDir, "kb.config.jsonc"), []byte(kbConfigJSONC), 0o640); err != nil {
		t.Fatal(err)
	}

	restoreCwd := chdir(t, projectRoot)
	defer restoreCwd()

	restoreFlag := setConfigPath(cfgPath)
	defer restoreFlag()

	result, err := FindConfig()
	if err != nil {
		t.Fatalf("FindConfig: %v", err)
	}
	if result.ConfigPath != cfgPath {
		t.Fatalf("ConfigPath = %q, want %q", result.ConfigPath, cfgPath)
	}
	// Resolve symlinks before comparing: on macOS, os.Getwd() returns the
	// /private/var/... resolved form while t.TempDir() hands back the
	// /var/... symlinked form of the same directory.
	wantProjectDir, err := filepath.EvalSymlinks(projectRoot)
	if err != nil {
		t.Fatalf("resolve projectRoot: %v", err)
	}
	if result.ProjectDir != wantProjectDir {
		t.Fatalf("ProjectDir = %q, want %q (cwd/project, not the platform dir %q)", result.ProjectDir, wantProjectDir, platformRoot)
	}
}

func chdir(t *testing.T, dir string) func() {
	t.Helper()
	original, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("chdir(%q): %v", dir, err)
	}
	return func() {
		_ = os.Chdir(original)
	}
}

func setConfigPath(path string) func() {
	original := configPath
	configPath = path
	return func() {
		configPath = original
	}
}

func jsonString(s string) string {
	// Minimal JSON string encoder sufficient for absolute filesystem paths
	// used only in this test fixture.
	escaped := make([]byte, 0, len(s)+2)
	escaped = append(escaped, '"')
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c == '\\' || c == '"' {
			escaped = append(escaped, '\\')
		}
		escaped = append(escaped, c)
	}
	escaped = append(escaped, '"')
	return string(escaped)
}
