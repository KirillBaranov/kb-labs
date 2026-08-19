package handlers

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kb-labs/create/internal/engine/executor"
	"github.com/kb-labs/create/internal/engine/plan"
)

// setupFakeService writes a minimal node_modules package with a kb.service
// manifest, matching internal/scan's expected fixture shape (see
// internal/scan/scan_test.go's setupFakePlatform) so scan.Run recognizes it.
func setupFakeService(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node not on PATH — discoveryHandler shells out to it via internal/scan")
	}
	dir := t.TempDir()
	svcDir := filepath.Join(dir, "node_modules", "cool-service")
	writeJSONFixture(t, filepath.Join(svcDir, "package.json"), map[string]any{
		"name": "cool-service", "version": "0.5.0", "kb": map[string]any{"manifest": "./dist/manifest.js"},
	})
	writeFileFixture(t, filepath.Join(svcDir, "dist", "manifest.js"), `
		module.exports.manifest = {
			schema: "kb.service/1",
			id: "cool",
			name: "Cool Service",
			version: "0.5.0",
			description: "A cool service",
			runtime: { entry: "dist/index.js", port: 9090, healthCheck: "/health" },
			dependsOn: [],
		};
	`)
	return dir
}

func writeJSONFixture(t *testing.T, path string, data any) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		t.Fatal(err)
	}
	b, err := json.Marshal(data)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, b, 0o600); err != nil {
		t.Fatal(err)
	}
}

func writeFileFixture(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestDiscoveryHandler_WritesRealScanOutput(t *testing.T) {
	platformDir := setupFakeService(t)
	h := &discoveryHandler{platformDir: platformDir, projectDir: ""}

	if _, err := h.Apply(context.Background(), plan.PlanAction{}); err != nil {
		t.Fatalf("Apply() error = %v", err)
	}

	data, err := os.ReadFile(filepath.Join(platformDir, ".kb", "devservices.yaml"))
	if err != nil {
		t.Fatalf("read devservices.yaml: %v", err)
	}
	if !strings.Contains(string(data), "cool") || !strings.Contains(string(data), "9090") {
		t.Errorf("devservices.yaml missing the discovered service, got:\n%s", data)
	}
	// marketplace.lock is only written when scan finds plugins/adapters (see
	// scan.WriteConfigs) — this fixture has a service only, so its absence
	// here is correct, not a regression.
}

// TestDiscoveryHandler_CheckAlwaysReportsNotSatisfied guards the documented
// behavior: discovery must re-run every time (it reflects current
// node_modules, which install/update legitimately change run to run), not
// be skipped once "already done".
func TestDiscoveryHandler_CheckAlwaysReportsNotSatisfied(t *testing.T) {
	h := &discoveryHandler{}
	ready, err := h.Check(context.Background(), plan.PlanAction{})
	if err != nil {
		t.Fatal(err)
	}
	if ready {
		t.Error("Check() = true, want false (discovery always re-runs)")
	}
}

func TestBinaryHandler_LocalPathCopiesInsteadOfDownloading(t *testing.T) {
	platformDir := t.TempDir()
	fakeHome := t.TempDir()
	t.Setenv("HOME", fakeHome)

	srcBin := filepath.Join(t.TempDir(), "my-tool")
	if err := os.WriteFile(srcBin, []byte("#!/bin/sh\necho hi\n"), 0o755); err != nil { //nolint:gosec
		t.Fatal(err)
	}

	h := &binaryHandler{platformDir: platformDir}
	action := plan.PlanAction{Inputs: map[string]string{"id": "my-tool", "name": "my-tool", "localPath": srcBin}}

	ready, err := h.Check(context.Background(), action)
	if err != nil {
		t.Fatalf("Check() error = %v", err)
	}
	if ready {
		t.Fatal("Check() = true before Apply, want false")
	}

	if _, err := h.Apply(context.Background(), action); err != nil {
		t.Fatalf("Apply() error = %v", err)
	}
	if err := h.Verify(context.Background(), action, executor.ActionResult{}); err != nil {
		t.Fatalf("Verify() error = %v", err)
	}

	if _, err := os.Stat(filepath.Join(platformDir, "bin", "my-tool")); err != nil {
		t.Errorf("binary not installed to platform bin dir: %v", err)
	}
	if _, err := os.Stat(filepath.Join(fakeHome, ".local", "bin", "my-tool")); err != nil {
		t.Errorf("binary not installed to user bin dir: %v", err)
	}
}

func TestBinaryHandler_UsesNameFallbackToID(t *testing.T) {
	action := plan.PlanAction{Inputs: map[string]string{"id": "kb-dev"}}
	if got := binaryName(action); got != "kb-dev" {
		t.Errorf("binaryName() = %q, want %q (fallback to id when name is empty)", got, "kb-dev")
	}
	action.Inputs["name"] = "kb-dev-explicit"
	if got := binaryName(action); got != "kb-dev-explicit" {
		t.Errorf("binaryName() = %q, want explicit name to win", got)
	}
}
