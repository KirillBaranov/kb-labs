// Package e2e contains the published-artifact V2 journey. It is deliberately
// outside the deterministic contract tests: it consumes the exact sealed
// release index and registry artifacts supplied by the promotion workflow.
package e2e

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"
)

// packageTagPattern matches the immutable candidate tag the delivery workflow
// stamps on every publish: "candidate-<flow>-<version>-<channel>-<sha>" (for
// example "candidate-platform-2.119.0-stable-30310c8f10a2"). The channel
// segment is release-deliver-candidate.yml's *build* channel input — which is
// embedded in the candidate/tag identity before the delivery job later
// chooses a rollout target — and it is also the only channel the sealed
// release index actually declares (see prepare-release-index.mjs, which
// writes `channels: { [buildChannel]: version }`). The smoke test must
// resolve against that same channel; requesting a different one always fails
// resolve with KB_CREATE_INCOMPATIBLE_COMPONENTS because the release index
// simply has no entry for it.
var packageTagPattern = regexp.MustCompile(`^candidate-(?:platform|sdk)-\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?-(canary|stable)-[0-9a-f]+$`)

// channelFromPackageTag extracts the release channel encoded in a
// KB_CREATE_PACKAGE_TAG-style candidate tag. It returns "" when the tag is
// empty or does not match the expected shape, letting the caller fall back to
// a sane default instead of resolving against a fabricated channel.
func channelFromPackageTag(tag string) string {
	match := packageTagPattern.FindStringSubmatch(tag)
	if match == nil {
		return ""
	}
	return match[1]
}

// TestChannelFromPackageTagMatchesDeliveredCandidateFormat guards against a
// regression to the bug this file previously shipped: the smoke test used to
// hardcode "--platform-channel canary" regardless of the candidate actually
// under test, so a real build delivered under a "stable" candidate tag (e.g.
// v2.119.0-binaries / candidate-platform-2.119.0-stable-30310c8f10a2, whose
// published release-index.json declares only "stable" in its channels map)
// made resolve.Plan fail closed with KB_CREATE_INCOMPATIBLE_COMPONENTS and an
// empty subject value, because "canary" was never a key in that index at all.
func TestChannelFromPackageTagMatchesDeliveredCandidateFormat(t *testing.T) {
	cases := []struct {
		name string
		tag  string
		want string
	}{
		{name: "real stable candidate from v2.119.0-binaries", tag: "candidate-platform-2.119.0-stable-30310c8f10a2", want: "stable"},
		{name: "canary candidate", tag: "candidate-platform-2.119.0-canary-30310c8f10a2", want: "canary"},
		{name: "sdk flow", tag: "candidate-sdk-1.2.3-canary-abcdef0123456789", want: "canary"},
		{name: "prerelease version segment", tag: "candidate-platform-2.119.0-rc.1-stable-30310c8f10a2", want: "stable"},
		{name: "empty tag falls back to caller default", tag: "", want: ""},
		{name: "unrecognized shape falls back to caller default", tag: "not-a-candidate-tag", want: ""},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := channelFromPackageTag(testCase.tag); got != testCase.want {
				t.Fatalf("channelFromPackageTag(%q) = %q, want %q", testCase.tag, got, testCase.want)
			}
		})
	}
}

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

	// The sealed release index only declares the channel the candidate was
	// actually built under (see channelFromPackageTag above), which need not
	// be "canary" — resolve.Plan fails closed with an empty subject value
	// whenever the requested channel is absent from the index, so requesting
	// a channel the index doesn't have is not a resolvable configuration.
	channel := channelFromPackageTag(os.Getenv("KB_CREATE_PACKAGE_TAG"))
	if channel == "" {
		channel = "canary"
	}

	args := []string{"apply", "--index", index, "--request-platform-root", platform, "--project-root", project, "--platform-channel", channel, "--policy", "strict"}
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
	updateOutput, updateCode := run(t, launcher, "update", "--index", index, "--request-platform-root", platform, "--project-root", project, "--platform-channel", channel, "--policy", "strict")
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
