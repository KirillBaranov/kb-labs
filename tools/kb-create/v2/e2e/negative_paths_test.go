package e2e

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kb-labs/create/v2/artifacts"
	"github.com/kb-labs/create/v2/catalog"
	"github.com/kb-labs/create/v2/contracts"
	"github.com/kb-labs/create/v2/preflight"
	"github.com/kb-labs/create/v2/resolve"
)

func TestV2CompatibilityFailureIsRejectedBeforeArtifactExecution(t *testing.T) {
	source := catalog.Catalog{
		Platforms: []catalog.PlatformBundle{{
			ID: "platform", Version: "2.0.0", Package: "@kb/platform", SHA256: "platform",
			Profiles: map[string]contracts.ServiceGraph{"default": {}},
		}},
		Plugins: []catalog.Component{{
			ID: "future-plugin", Version: "3.0.0", Package: "@kb/future-plugin", SHA256: "plugin", PlatformRange: "^3.0.0",
		}},
	}
	_, err := resolve.Plan(contracts.InstallRequest{
		PlatformRoot: t.TempDir(),
		Plugins:      []contracts.ComponentRequest{{ID: "future-plugin"}},
	}, source)
	var launcherErr *contracts.LauncherError
	if !errors.As(err, &launcherErr) || launcherErr.Code != contracts.CodeIncompatibleComponents {
		t.Fatalf("error = %T %#v, want %s", err, err, contracts.CodeIncompatibleComponents)
	}
}

func TestV2NetworkFailureIsReportedBeforePnpmMutation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "registry unavailable", http.StatusServiceUnavailable)
	}))
	defer server.Close()
	root := t.TempDir()
	err := (artifacts.Pnpm{
		Root:   root,
		Client: server.Client(),
	}).Install([]contracts.Artifact{{
		ID: "platform", Package: "@kb/platform", Version: "2.0.0",
		Tarball: server.URL + "/platform.tgz", SHA256: "not-the-response",
	}})
	if err == nil {
		t.Fatal("expected registry failure")
	}
	if _, statErr := os.Stat(filepath.Join(root, "node_modules")); !os.IsNotExist(statErr) {
		t.Fatalf("pnpm mutation started after download failure: %v", statErr)
	}
}

func TestV2ToolchainFailureIsActionableForNodeAndPnpm(t *testing.T) {
	cases := []struct {
		name     string
		versions map[string]string
		want     string
	}{
		{name: "node", versions: map[string]string{"node": "v20.18.0", "pnpm": "11.4.0"}, want: "Node.js 24.x only"},
		{name: "pnpm", versions: map[string]string{"node": "v24.18.0", "pnpm": "10.9.0"}, want: "pnpm 11.x"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := preflight.EnsureWith(func(binary string) (string, error) {
				return tc.versions[binary], nil
			}, nil)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("error = %v, want %q", err, tc.want)
			}
		})
	}
}

// TestV2LegacyIndexFixtureIsRejectedWithTypedSchemaError is the PR7 DoD gate:
// an index published before the cutover must be rejected on its schema, with a
// typed code, and there must be no branch that retries it under older rules.
func TestV2LegacyIndexFixtureIsRejectedWithTypedSchemaError(t *testing.T) {
	fixtures := map[string]string{
		"v1 index":              `{"schema":"kb.create.release-index/v1","channels":{"stable":"2.0.0"},"platforms":[{"id":"platform","version":"2.0.0","package":"@kb/platform","sha256":"a","tarball":"https://example.test/p.tgz"}]}`,
		"npm dist-tag manifest": `{"name":"@kb-labs/cli","dist-tags":{"latest":"2.0.0"},"versions":{"2.0.0":{}}}`,
		"unversioned index":     `{"platforms":[{"id":"platform","version":"2.0.0"}]}`,
	}
	for name, document := range fixtures {
		t.Run(name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "release-index.json")
			if err := os.WriteFile(path, []byte(document), 0o600); err != nil {
				t.Fatal(err)
			}
			_, err := catalog.LoadFile(path)
			if contracts.CodeOf(err) != contracts.CodeReleaseSchemaUnsupported {
				t.Fatalf("error = %v, want %s", err, contracts.CodeReleaseSchemaUnsupported)
			}
		})
	}
}

// The dropped targets must fail with the typed target diagnostic rather than
// with an empty artifact selection that looks like a corrupt release.
func TestV2UnsupportedTargetIsRejectedWithTypedDiagnostic(t *testing.T) {
	source := catalog.Catalog{
		Platforms: []catalog.PlatformBundle{{
			ID: "platform", Version: "2.0.0", Package: "@kb/platform", SHA256: "platform",
			Profiles:  map[string]contracts.ServiceGraph{"default": {}},
			Toolchain: &catalog.ToolchainRequirement{NodeMajor: 24, PnpmMajor: 11},
		}},
	}
	if _, err := source.Platforms[0].Toolchain.ManagedFor("windows", "amd64"); contracts.CodeOf(err) != contracts.CodeReleaseTargetUnsupported {
		t.Fatalf("error = %v, want %s", err, contracts.CodeReleaseTargetUnsupported)
	}
}

// A release that declares a toolchain the host does not satisfy is installable
// when the release ships a managed toolchain for this target, and only then.
func TestV2ToolchainContractComesFromTheRelease(t *testing.T) {
	stale := func(binary string) (string, error) {
		return map[string]string{"node": "v22.1.0", "pnpm": "11.4.0"}[binary], nil
	}
	if _, err := preflight.EnsureContract(preflight.Requirement{NodeMajor: 24, PnpmMajor: 11}, stale, nil); err == nil {
		t.Fatal("expected the release-declared Node major to be enforced")
	}
	decision, err := preflight.EnsureContract(preflight.Requirement{NodeMajor: 24, PnpmMajor: 11, ManagedAvailable: true}, stale, nil)
	if err != nil || !decision.UseManaged {
		t.Fatalf("decision/error = %#v / %v", decision, err)
	}
	// A release that declares a different Node major is honoured without a new
	// launcher: the requirement is read, never compiled in.
	if _, err := preflight.EnsureContract(preflight.Requirement{NodeMajor: 22, PnpmMajor: 11}, stale, nil); err != nil {
		t.Fatalf("release-declared Node 22 should be accepted: %v", err)
	}
}
