package render

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kb-labs/create/v2/contracts"
)

func TestBuildRejectsDuplicatePorts(t *testing.T) {
	plan := testPlan(t.TempDir())
	plan.ServiceGraph.Services = append(plan.ServiceGraph.Services, contracts.Service{ID: "duplicate", Command: "serve", Port: 4000})
	if _, err := Build(plan); err == nil {
		t.Fatal("expected duplicate-port validation error")
	}
}

func TestBuildProjectsSecretAsPlaceholderOnly(t *testing.T) {
	plan := testPlan(t.TempDir())
	plan.ConfigPatches = []contracts.ConfigPatch{{Owner: "manifest:token", Environment: "TOKEN", Services: []string{"gateway"}}}
	output, err := Build(plan)
	if err != nil {
		t.Fatal(err)
	}
	value := output.Devservices.Services["gateway"].Env["TOKEN"]
	if value != "${TOKEN}" || strings.Contains(string(output.Config), "TOKEN") {
		t.Fatalf("secret projection = %q / %s", value, output.Config)
	}
}

func TestBuildRendersHealthCheckAsAbsoluteLocalhostURL(t *testing.T) {
	plan := testPlan(t.TempDir())
	plan.ServiceGraph.Services[0].HealthCheck = "/health"
	output, err := Build(plan)
	if err != nil {
		t.Fatal(err)
	}
	if got := output.Devservices.Services["gateway"].HealthCheck; got != "http://localhost:4000/health" {
		t.Fatalf("health check = %q", got)
	}
}

// Regression coverage: kb-dev's config loader derives its Groups map (used to
// resolve `kb-dev start backend`) from each service's own `group` field in
// devservices.yaml — a rendered file with no `group` anywhere silently drops
// every group, including "backend", breaking any caller that starts services
// by group name. gateway is a known "backend" member (mirroring
// .kb/devservices.dev.yaml's hand-authored groups); an unrecognized service
// ID must render with no group at all, not a guessed one.
func TestBuildAssignsConventionalServiceGroups(t *testing.T) {
	plan := testPlan(t.TempDir())
	plan.ServiceGraph.Services = append(plan.ServiceGraph.Services, contracts.Service{ID: "state-daemon", Command: "serve", Port: 7777})
	plan.ServiceGraph.Services = append(plan.ServiceGraph.Services, contracts.Service{ID: "mcp-daemon", Command: "serve", Port: 7779})
	output, err := Build(plan)
	if err != nil {
		t.Fatal(err)
	}
	if got := output.Devservices.Services["gateway"].Group; got != "backend" {
		t.Fatalf("gateway group = %q, want backend", got)
	}
	if got := output.Devservices.Services["state-daemon"].Group; got != "infra" {
		t.Fatalf("state-daemon group = %q, want infra", got)
	}
	if got := output.Devservices.Services["mcp-daemon"].Group; got != "" {
		t.Fatalf("mcp-daemon group = %q, want unset (no known conventional group yet)", got)
	}
}

func TestWriteProducesCompleteV2Projections(t *testing.T) {
	root := t.TempDir()
	if _, err := Write(testPlan(root)); err != nil {
		t.Fatal(err)
	}
	for _, relative := range []string{".kb/kb.config.jsonc", ".kb/devservices.yaml"} {
		data, err := os.ReadFile(filepath.Join(root, relative))
		if err != nil || len(data) == 0 {
			t.Fatalf("%s = %q, %v", relative, data, err)
		}
		if _, err := os.Stat(filepath.Join(root, relative+".tmp")); !os.IsNotExist(err) {
			t.Fatalf("temporary projection remains for %s", relative)
		}
	}
}

func TestWriteCreatesProjectPointerWithoutOverwritingUserConfig(t *testing.T) {
	platformRoot, projectRoot := t.TempDir(), t.TempDir()
	plan := testPlan(platformRoot)
	plan.Request.ProjectRoot = projectRoot
	if _, err := Write(plan); err != nil {
		t.Fatal(err)
	}
	pointer := filepath.Join(projectRoot, ".kb", ConfigFilename)
	data, err := os.ReadFile(pointer)
	if err != nil || !strings.Contains(string(data), platformRoot) {
		t.Fatalf("project pointer = %s, error = %v", data, err)
	}
	if err := os.WriteFile(pointer, []byte(`{"platform":{"dir":"user-owned"}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Write(plan); err != nil {
		t.Fatal(err)
	}
	data, err = os.ReadFile(pointer)
	if err != nil || !strings.Contains(string(data), "user-owned") {
		t.Fatalf("user config was overwritten: %s / %v", data, err)
	}
}

func testPlan(root string) contracts.ResolvedInstallPlan {
	return contracts.ResolvedInstallPlan{
		Schema:       contracts.ResolvedPlanSchema,
		Request:      contracts.InstallRequest{PlatformRoot: root},
		ServiceGraph: contracts.ServiceGraph{PlatformVersion: "2.0.0", Services: []contracts.Service{{ID: "gateway", Command: "serve", Port: 4000}}},
	}
}
