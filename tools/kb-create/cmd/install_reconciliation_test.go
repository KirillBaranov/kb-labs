package cmd

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kb-labs/create/internal/scan"
)

// writeFakePluginManifest writes a minimal dist/manifest.json (kb.plugin/3
// schema) under <platformDir>/node_modules/<id>/dist/manifest.json, mirroring
// the shape devkit's build hook emits for real plugins. Returns a
// ResolvedPath relative to platformDir — scanner.js computes it as
// `'./' + path.relative(platformDir, pkgRoot)`, never an absolute path, so a
// test using an absolute ResolvedPath here would not catch a caller that
// forgets to join it against platformDir before reading (which is exactly
// the bug this test file's callers must exercise).
func writeFakePluginManifest(t *testing.T, platformDir, id string, requires, optional []string) string {
	t.Helper()
	pluginDir := filepath.Join(platformDir, "node_modules", id)
	distDir := filepath.Join(pluginDir, "dist")
	if err := os.MkdirAll(distDir, 0o750); err != nil {
		t.Fatal(err)
	}
	m := map[string]any{
		"schema":  "kb.plugin/3",
		"id":      id,
		"version": "1.0.0",
		"platform": map[string]any{
			"requires": requires,
			"optional": optional,
		},
	}
	data, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(distDir, "manifest.json"), data, 0o644); err != nil {
		t.Fatal(err)
	}
	return "./" + filepath.Join("node_modules", id)
}

func writeFakeAdapterRoles(t *testing.T, platformDir string, roles []string) {
	t.Helper()
	dir := filepath.Join(platformDir, "node_modules", "@kb-labs", "plugin-runtime", "dist")
	if err := os.MkdirAll(dir, 0o750); err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(roles)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "adapter-roles.json"), data, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestPrintAdapterReconciliation_RequiredUnconfigured(t *testing.T) {
	platformDir := t.TempDir()
	resolvedPath := writeFakePluginManifest(t, platformDir, "@test/release", []string{"storage", "cache"}, []string{"vectorStore"})

	out := newOutput()
	output := captureStdout(t, func() {
		printAdapterReconciliation(out, platformDir, nil, []scan.PluginEntry{
			{ID: "@test/release", ResolvedPath: resolvedPath},
		})
	})

	if !strings.Contains(output, `requires capability "cache"`) {
		t.Errorf("expected a warning about the unconfigured required cache role, got:\n%s", output)
	}
	if strings.Contains(output, `requires capability "storage"`) {
		t.Errorf("storage has a default adapter and should NOT be flagged as unconfigured:\n%s", output)
	}
	if !strings.Contains(output, `optional capability "vectorStore"`) {
		t.Errorf("expected an informational note about the unconfigured optional vectorStore role, got:\n%s", output)
	}
}

func TestPrintAdapterReconciliation_SatisfiedByOverride(t *testing.T) {
	platformDir := t.TempDir()
	resolvedPath := writeFakePluginManifest(t, platformDir, "@test/release", []string{"cache"}, nil)

	out := newOutput()
	output := captureStdout(t, func() {
		printAdapterReconciliation(out, platformDir, map[string]string{"cache": "@kb-labs/adapters-redis@0.2.0"},
			[]scan.PluginEntry{{ID: "@test/release", ResolvedPath: resolvedPath}})
	})

	if strings.Contains(output, "requires capability") {
		t.Errorf("cache is configured via --adapters override, should not be flagged:\n%s", output)
	}
}

func TestPrintAdapterReconciliation_UnknownRole(t *testing.T) {
	platformDir := t.TempDir()
	writeFakeAdapterRoles(t, platformDir, []string{"llm", "cache", "storage"})

	out := newOutput()
	output := captureStdout(t, func() {
		printAdapterReconciliation(out, platformDir, map[string]string{"bogus-role": "@some/pkg@1.0.0"}, nil)
	})

	if !strings.Contains(output, `"bogus-role" is not a recognized capability role`) {
		t.Errorf("expected a warning about the unrecognized role, got:\n%s", output)
	}
}

// TestPrintAdapterReconciliation_ResolvesRelativeToPlatformDirNotCwd pins the
// exact bug this file's fixtures previously masked (by using an absolute
// ResolvedPath, which happens to resolve correctly regardless of platformDir
// prefixing): a real `kb-create install --plugins=... --platform ~/kb-platform`
// is normally run from the user's project directory, not from inside the
// platform dir. ResolvedPath is relative to platformDir (scanner.js), so
// resolving it against the process's cwd instead — as printAdapterReconciliation
// did before this fix — silently found nothing and skipped every warning.
func TestPrintAdapterReconciliation_ResolvesRelativeToPlatformDirNotCwd(t *testing.T) {
	platformDir := t.TempDir()
	resolvedPath := writeFakePluginManifest(t, platformDir, "@test/release", []string{"cache"}, nil)

	// A cwd that shares no relationship with platformDir at all — resolving
	// ResolvedPath against this instead of platformDir must fail to find the
	// manifest, not accidentally succeed.
	unrelatedCwd := t.TempDir()
	oldWd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(unrelatedCwd); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(oldWd) })

	out := newOutput()
	output := captureStdout(t, func() {
		printAdapterReconciliation(out, platformDir, nil, []scan.PluginEntry{
			{ID: "@test/release", ResolvedPath: resolvedPath},
		})
	})

	if !strings.Contains(output, `requires capability "cache"`) {
		t.Errorf("expected the unconfigured 'cache' warning regardless of cwd, got:\n%s", output)
	}
}

func TestPrintAdapterReconciliation_NoRolesFileIsSoft(t *testing.T) {
	platformDir := t.TempDir() // no adapter-roles.json at all

	out := newOutput()
	output := captureStdout(t, func() {
		printAdapterReconciliation(out, platformDir, map[string]string{"cache": "@kb-labs/adapters-redis"}, nil)
	})

	if output != "" {
		t.Errorf("missing adapter-roles.json should silently skip role-name validation, got:\n%s", output)
	}
}
