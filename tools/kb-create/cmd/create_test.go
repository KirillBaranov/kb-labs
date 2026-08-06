package cmd

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/kb-labs/create/internal/manifest"
)

func TestDeclarativeRegistryUsesManifestSource(t *testing.T) {
	if got := declarativeRegistry(&manifest.Manifest{RegistryURL: "http://verdaccio:4873"}); got != "http://verdaccio:4873" {
		t.Fatalf("declarativeRegistry() = %q, want manifest registry", got)
	}
	if got := declarativeRegistry(&manifest.Manifest{}); got != "" {
		t.Fatalf("declarativeRegistry() = %q, want empty registry", got)
	}
}

func TestResolveDeclarativeProjectDirPreservesCreateRoot(t *testing.T) {
	requested := filepath.Join(t.TempDir(), "kb-e2e")
	got, provided, err := resolveDeclarativeProjectDir(requested, filepath.Join(t.TempDir(), "stale"))
	if err != nil {
		t.Fatal(err)
	}
	if got != requested || !provided {
		t.Fatalf("resolveDeclarativeProjectDir() = (%q, %t), want (%q, true)", got, provided, requested)
	}
	if info, err := os.Stat(requested); err != nil || !info.IsDir() {
		t.Fatalf("requested project root was not created: %v", err)
	}
}

func TestResolveDeclarativeProjectDirUsesConfiguredRootForInstall(t *testing.T) {
	configured := filepath.Join(t.TempDir(), "project")
	got, provided, err := resolveDeclarativeProjectDir("", configured)
	if err != nil {
		t.Fatal(err)
	}
	if got != configured || provided {
		t.Fatalf("resolveDeclarativeProjectDir() = (%q, %t), want (%q, false)", got, provided, configured)
	}
}

// TestEnvOrDefault_RespectsBootstrapEnvVars guards against a regression where
// runCreate's non-local branch hardcoded BootstrapAdminEmail/BootstrapTenantID
// literals that always won over GATEWAY_BOOTSTRAP_ADMIN_EMAIL /
// GATEWAY_BOOTSTRAP_TENANT_ID once the surrounding fix started writing the
// gateway.auth.bootstrap config block (previously that block was never
// written at all, so the gateway's own env-var fallback took effect and env
// vars appeared to work). services/gateway/app/src/bootstrap.ts resolves
// tenantId/adminEmail as `config.auth?.bootstrap?.X ?? process.env.X`, so a
// literal written into the config permanently shadows the env var for every
// install — this broke every E2E suite whose docker-compose sets
// GATEWAY_BOOTSTRAP_TENANT_ID=kblabs-cloud, since the bootstrap admin ended
// up created under a different tenant than the one E2E test clients log in
// against, and every login failed with invalid_credentials.
func TestEnvOrDefault_RespectsBootstrapEnvVars(t *testing.T) {
	t.Run("env var set overrides default", func(t *testing.T) {
		t.Setenv("GATEWAY_BOOTSTRAP_TENANT_ID", "kblabs-cloud")
		if got := envOrDefault("GATEWAY_BOOTSTRAP_TENANT_ID", "default"); got != "kblabs-cloud" {
			t.Errorf("envOrDefault() = %q, want %q (env var must win)", got, "kblabs-cloud")
		}
	})

	t.Run("no env var falls back to default", func(t *testing.T) {
		t.Setenv("GATEWAY_BOOTSTRAP_TENANT_ID", "")
		if got := envOrDefault("GATEWAY_BOOTSTRAP_TENANT_ID", "default"); got != "default" {
			t.Errorf("envOrDefault() = %q, want %q", got, "default")
		}
	})
}

// TestDemoFlagUsage_DoesNotOverpromise guards against a regression where
// --demo's help text said "install demo plugins and run pipeline on your
// code". In reality --demo only writes an example workflow file
// (.kb/workflows/demo.yaml, see internal/scaffold/scaffold.go
// writeDemoWorkflow) — it does not change plugin/service selection
// (internal/wizard/wizard.go defaultSelection ignores DemoMode for those)
// and nothing is run automatically. A user picking --demo expecting an
// installed demo plugin or an executed pipeline got neither.
func TestDemoFlagUsage_DoesNotOverpromise(t *testing.T) {
	f := rootCmd.Flags().Lookup("demo")
	if f == nil {
		t.Fatal("--demo flag not registered")
	}
	if strings.Contains(f.Usage, "install demo plugins") {
		t.Errorf("--demo usage = %q, claims to install demo plugins, which it does not do", f.Usage)
	}
	if strings.Contains(f.Usage, "run pipeline") {
		t.Errorf("--demo usage = %q, claims to run a pipeline, but nothing is run automatically", f.Usage)
	}
}

func TestTelemetryFailureCategoryAvoidsRawErrorPayload(t *testing.T) {
	for _, tc := range []struct {
		err  error
		want string
	}{
		{errors.New("ERR_PNPM_NO_MATCHING_VERSION: @kb-labs/data-store"), "dependency_version"},
		{errors.New("preflight failed: node is missing"), "environment_preflight"},
		{errors.New("permission denied: /private/project"), "filesystem_permission"},
	} {
		if got := telemetryFailureCategory(tc.err); got != tc.want {
			t.Errorf("telemetryFailureCategory(%q) = %q, want %q", tc.err, got, tc.want)
		}
	}
}

func TestSpinnerKeepsUntruncatedTailForFatalReport(t *testing.T) {
	spinner := newSpinner()
	spinner.setDetail("ERR_PNPM_NO_MATCHING_VERSION " + strings.Repeat("x", 100))
	if got := spinner.failureDetails(); !strings.Contains(got, strings.Repeat("x", 100)) {
		t.Errorf("failureDetails() truncated package-manager output: %q", got)
	}
	if spinner.detail != "" {
		t.Errorf("spinner leaked package-manager detail into live UI: %q", spinner.detail)
	}
}

func TestLoaderMessageRotatesWithoutLosingFriendlyCopy(t *testing.T) {
	if got := loaderMessage(0); got != "Putting the platform together" {
		t.Errorf("loaderMessage(0) = %q", got)
	}
	if got := loaderMessage(2 * time.Second); got != "Installing the useful bits" {
		t.Errorf("loaderMessage(2s) = %q", got)
	}
}
