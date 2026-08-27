// Package e2e contains the published-artifact V2 journey. It is deliberately
// outside the deterministic contract tests: it consumes the exact sealed
// release index and registry artifacts supplied by the promotion workflow.
package e2e

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestPublishedV2JourneyInstallsExactRelease(t *testing.T) {
	if testing.Short() {
		t.Skip("published-artifact V2 journey requires registry and running services")
	}
	index := os.Getenv("KB_CREATE_RELEASE_INDEX")
	if index == "" {
		root, err := filepath.Abs("../..")
		if err != nil {
			t.Fatal(err)
		}
		index = filepath.Join(root, ".kb", "release", "release-index.json")
	}
	if _, err := os.Stat(index); err != nil {
		t.Skipf("published V2 release index is unavailable: %v", err)
	}

	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	launcher := os.Getenv("KB_CREATE_BINARY")
	if launcher == "" {
		launcher = filepath.Join(t.TempDir(), "kb-create")
		build := exec.Command("go", "build", "-trimpath", "-o", launcher, ".")
		build.Dir = root
		if output, err := build.CombinedOutput(); err != nil {
			t.Fatalf("build V2 root launcher: %v\n%s", err, output)
		}
	} else if info, err := os.Stat(launcher); err != nil || info.Mode()&0o111 == 0 {
		t.Fatalf("published kb-create binary is not executable: %s (%v)", launcher, err)
	}
	platform, project := filepath.Join(t.TempDir(), "platform"), filepath.Join(t.TempDir(), "project")
	if err := os.MkdirAll(project, 0o750); err != nil {
		t.Fatal(err)
	}

	args := []string{"apply", "--index", index, "--request-platform-root", platform, "--project-root", project, "--platform-channel", "canary", "--policy", "strict"}
	if registry := os.Getenv("KB_REGISTRY_URL"); registry != "" {
		args = append(args, "--registry", registry)
	}
	if output, code := run(t, launcher, args...); code != 0 {
		t.Fatalf("V2 apply exited %d:\n%s", code, output)
	}
	for _, path := range []string{filepath.Join(platform, ".kb", "v2", "receipt.json"), filepath.Join(platform, ".kb", "kb.config.jsonc"), filepath.Join(platform, ".kb", "devservices.yaml"), filepath.Join(project, ".kb", "kb.config.jsonc")} {
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("V2 install artifact %s is missing: %v", path, err)
		}
	}
	if output, code := run(t, launcher, "status", "--platform-root", platform); code != 0 {
		t.Fatalf("V2 status exited %d:\n%s", code, output)
	}
	updateOutput, updateCode := run(t, launcher, "update", "--index", index, "--request-platform-root", platform, "--project-root", project, "--platform-channel", "canary", "--policy", "strict")
	if updateCode != 0 {
		t.Fatalf("V2 update exited %d: %s", updateCode, updateOutput)
	}
	var updateResponse struct {
		OK      bool `json:"ok"`
		Receipt struct {
			SnapshotID string `json:"snapshotId"`
		} `json:"receipt"`
	}
	if err := json.Unmarshal([]byte(updateOutput), &updateResponse); err != nil || !updateResponse.OK || updateResponse.Receipt.SnapshotID == "" {
		t.Fatalf("V2 update did not commit a recovery snapshot: %s", updateOutput)
	}
	assertReceiptContainsIndexedPackages(t, index, filepath.Join(platform, ".kb", "v2", "receipt.json"))
}

// Published smoke checks the release contract: every exact package named by
// the sealed index must appear in the committed installation receipt. Runtime
// configuration and service orchestration are not release-index concerns.
func assertReceiptContainsIndexedPackages(t *testing.T, indexPath, receiptPath string) {
	t.Helper()
	var index struct {
		Platforms []struct {
			Package  string `json:"package"`
			Packages []struct {
				Package string `json:"package"`
			} `json:"packages"`
		} `json:"platforms"`
	}
	var receipt struct {
		Plan struct {
			Artifacts []struct {
				Package string `json:"package"`
			} `json:"artifacts"`
		} `json:"plan"`
	}
	indexData, err := os.ReadFile(indexPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(indexData, &index); err != nil {
		t.Fatal(err)
	}
	receiptData, err := os.ReadFile(receiptPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(receiptData, &receipt); err != nil {
		t.Fatal(err)
	}
	installed := map[string]bool{}
	for _, artifact := range receipt.Plan.Artifacts {
		installed[artifact.Package] = true
	}
	for _, platform := range index.Platforms {
		if !installed[platform.Package] {
			t.Fatalf("receipt is missing indexed platform package %s", platform.Package)
		}
		for _, pkg := range platform.Packages {
			if !installed[pkg.Package] {
				t.Fatalf("receipt is missing indexed release package %s", pkg.Package)
			}
		}
	}
}

func run(t *testing.T, binary string, args ...string) (string, int) {
	return runIn(t, "", binary, args...)
}

func runIn(t *testing.T, dir, command string, args ...string) (string, int) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, command, args...)
	if dir != "" {
		cmd.Dir = dir
	}
	cmd.Env = os.Environ()
	output, err := cmd.CombinedOutput()
	if err == nil {
		return string(output), 0
	}
	if exit, ok := err.(*exec.ExitError); ok {
		return string(output), exit.ExitCode()
	}
	t.Fatalf("command %s failed: %v\n%s", command, err, output)
	return string(output), 1
}
