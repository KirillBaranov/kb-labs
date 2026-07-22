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
// the shape devkit's build hook emits for real plugins.
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
	return pluginDir
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
	pluginDir := writeFakePluginManifest(t, platformDir, "@test/release", []string{"storage", "cache"}, []string{"vectorStore"})

	out := newOutput()
	output := captureStdout(t, func() {
		printAdapterReconciliation(out, platformDir, nil, []scan.PluginEntry{
			{ID: "@test/release", ResolvedPath: pluginDir},
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
	pluginDir := writeFakePluginManifest(t, platformDir, "@test/release", []string{"cache"}, nil)

	out := newOutput()
	output := captureStdout(t, func() {
		printAdapterReconciliation(out, platformDir, map[string]string{"cache": "@kb-labs/adapters-redis@0.2.0"},
			[]scan.PluginEntry{{ID: "@test/release", ResolvedPath: pluginDir}})
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
