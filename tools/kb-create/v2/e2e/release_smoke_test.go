// Package e2e contains the published-artifact V2 journey. It is deliberately
// outside the deterministic contract tests: it consumes the exact sealed
// release index and registry artifacts supplied by the promotion workflow.
package e2e

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/kb-labs/create/v2/contracts"
)

func TestPublishedV2JourneyReachesPluginWorkflow(t *testing.T) {
	if testing.Short() {
		t.Skip("published-artifact V2 journey requires registry and running services")
	}
	// The smoke profile is credential-free by default: it resolves a release
	// through the published control plane and installs it. No provider API key
	// is read here, so a missing external credential can never be mistaken for
	// a broken release.
	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	// Resolution goes through pointer -> descriptor -> index exactly as a user
	// install does. There is deliberately no environment variable that hands
	// the launcher an index path: that shortcut would skip the two digest
	// checks the whole delivery model rests on.
	base := serveReleaseControlPlane(t, filepath.Join(root, ".kb", "release", "release-index.json"))
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

	args := []string{"apply", "--release-base", base, "--request-platform-root", platform, "--project-root", project, "--platform-channel", "canary", "--policy", "strict"}
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
	updateOutput, updateCode := run(t, launcher, "update", "--release-base", base, "--request-platform-root", platform, "--project-root", project, "--platform-channel", "canary", "--policy", "strict")
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
	// The published journey exercises commands that talk to the installed
	// marketplace/workflow services.  Bring up the installed graph explicitly;
	// apply/update intentionally only materialise the platform and must not
	// implicitly mutate the host's service state.
	kbDev := filepath.Join(platform, ".kb", "v2", "bin", "kb-dev")
	if info, err := os.Stat(kbDev); err != nil || info.Mode()&0o111 == 0 {
		t.Fatalf("installed kb-dev binary is missing or not executable: %s (%v)", kbDev, err)
	}
	config := filepath.Join(platform, ".kb", "devservices.yaml")
	if output, code := run(t, kbDev, "--config", config, "ensure", "marketplace", "workflow"); code != 0 {
		t.Fatalf("installed service graph did not start: %s", output)
	}
	marketplaceURL := installedServiceURL(t, kbDev, config, "marketplace")
	t.Setenv("KB_MARKETPLACE_URL", marketplaceURL)
	t.Cleanup(func() {
		_, _ = run(t, kbDev, "--config", config, "stop", "marketplace", "workflow")
	})

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

// installedServiceURL obtains the actual kb-dev-resolved address instead of
// reconstructing it from a base port. That keeps this published-artifact test
// valid for an automatically derived KB_NET_OFFSET and avoids a hidden gateway
// dependency: scaffold talks directly to the marketplace service it installed.
func installedServiceURL(t *testing.T, kbDev, config, serviceID string) string {
	t.Helper()
	output, code := run(t, kbDev, "--config", config, "status", "--json")
	if code != 0 {
		t.Fatalf("read installed service status: %s", output)
	}
	var status struct {
		Services map[string]struct {
			URL   string `json:"url"`
			State string `json:"state"`
		} `json:"services"`
	}
	if err := json.Unmarshal([]byte(output), &status); err != nil {
		t.Fatalf("decode installed service status: %v\n%s", err, output)
	}
	service, ok := status.Services[serviceID]
	if !ok || strings.TrimSpace(service.URL) == "" {
		t.Fatalf("installed service %q has no resolved URL: %s", serviceID, output)
	}
	if service.State != "alive" {
		t.Fatalf(
			"installed service %q is not ready (%s): %s\nmanaged service log:\n%s",
			serviceID,
			service.State,
			output,
			installedServiceLog(kbDev, config, serviceID),
		)
	}
	return service.URL
}

// installedServiceLog preserves the child-process stderr that can be lost
// from kb-dev status after a startup crash. Published smoke must report the
// concrete service failure, not just its reconciled "dead" state.
func installedServiceLog(kbDev, config, serviceID string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	output, err := exec.CommandContext(ctx, kbDev, "--config", config, "logs", serviceID, "--lines", "200").CombinedOutput()
	if err != nil {
		return fmt.Sprintf("unable to read managed log: %v\n%s", err, output)
	}
	return string(output)
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

// serveReleaseControlPlane publishes the release index behind a local
// pointer/descriptor chain with real digests. It is a test double for the
// hosting decision only: the launcher performs the same two digest checks it
// performs against the production endpoint, and no code path here is aware it
// is talking to a double. PR 8 repoints this at the real endpoint.
func serveReleaseControlPlane(t *testing.T, indexPath string) string {
	t.Helper()
	index, err := os.ReadFile(indexPath)
	if err != nil {
		t.Skipf("published V2 release index is unavailable: %v", err)
	}
	releaseID := "platform-smoke"
	descriptor := contracts.ReleaseDescriptor{
		Schema:       contracts.ReleaseDescriptorSchema,
		ReleaseID:    releaseID,
		CandidateID:  releaseID + "-smoke",
		BundleSHA256: sha256Hex([]byte("smoke-bundle")),
		Index:        contracts.PointerReference{Path: "platform/release-index.json", SHA256: sha256Hex(index)},
		Launcher: contracts.ReleaseLauncher{Version: "0.0.0-smoke", Artifacts: []contracts.LauncherArtifact{
			{OS: runtime.GOOS, Arch: runtime.GOARCH, Path: "platform/kb-create", SHA256: sha256Hex([]byte("smoke-launcher"))},
		}},
		PreparedAt: time.Now().UTC().Format(time.RFC3339),
	}
	descriptorBytes, err := json.Marshal(descriptor)
	if err != nil {
		t.Fatal(err)
	}
	pointer := contracts.ReleaseChannelPointer{
		Schema:    contracts.ReleaseChannelPointerSchema,
		Channel:   contracts.ChannelCanary,
		ReleaseID: releaseID,
		Release:   contracts.PointerReference{Path: "releases/" + releaseID + "/release.json", SHA256: sha256Hex(descriptorBytes)},
	}
	pointerBytes, err := json.Marshal(pointer)
	if err != nil {
		t.Fatal(err)
	}
	documents := map[string][]byte{
		"/channels/canary.json":                    pointerBytes,
		"/releases/" + releaseID + "/release.json": descriptorBytes,
		"/platform/release-index.json":             index,
	}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		body, ok := documents[request.URL.Path]
		if !ok {
			writer.WriteHeader(http.StatusNotFound)
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write(body)
	}))
	t.Cleanup(server.Close)
	return server.URL
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
