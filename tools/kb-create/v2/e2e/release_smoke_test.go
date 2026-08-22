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
	"strings"
	"testing"
	"time"
)

func TestPublishedV2JourneyReachesPluginWorkflow(t *testing.T) {
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

	cli := filepath.Join(platform, "node_modules", "@kb-labs", "cli-bin", "dist", "bin.js")
	if _, err := os.Stat(cli); err != nil {
		t.Fatalf("installed kb CLI is missing: %v", err)
	}
	t.Setenv("KB_PLATFORM", platform)
	t.Setenv("KB_PROJECT", project)
	if output, code := runIn(t, project, "node", cli, "scaffold", "run", "plugin", "e2e-user", "--yes"); code != 0 {
		t.Fatalf("scaffold own plugin exited %d:\n%s", code, output)
	}
	pluginRoot := filepath.Join(project, ".kb", "plugins", "e2e-user")
	if _, err := os.Stat(filepath.Join(pluginRoot, "package.json")); err != nil {
		t.Fatalf("scaffolded plugin package is missing: %v", err)
	}
	workflowOutput, code := runIn(t, project, "node", cli, "workflow", "run", "--workflow-id", "healthcheck", "--json")
	if code != 0 {
		t.Fatalf("workflow run exited %d:\n%s", code, workflowOutput)
	}
	var response map[string]any
	if err := json.Unmarshal([]byte(workflowOutput), &response); err != nil {
		t.Fatalf("workflow response is not JSON: %v\n%s", err, workflowOutput)
	}
	if strings.TrimSpace(stringValue(response["runId"])) == "" && strings.TrimSpace(stringValue(response["id"])) == "" {
		t.Fatalf("workflow response has no run ID: %s", workflowOutput)
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

func stringValue(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	return ""
}
