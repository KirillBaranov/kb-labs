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

func TestBuildRejectsUnknownServiceDependency(t *testing.T) {
	plan := testPlan(t.TempDir())
	plan.ServiceGraph.Services[0].DependsOn = []string{"missing"}
	if _, err := Build(plan); err == nil || !strings.Contains(err.Error(), "unknown service") {
		t.Fatalf("error = %v", err)
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

func testPlan(root string) contracts.ResolvedInstallPlan {
	return contracts.ResolvedInstallPlan{
		Schema:       contracts.ResolvedPlanSchema,
		Request:      contracts.InstallRequest{PlatformRoot: root},
		ServiceGraph: contracts.ServiceGraph{PlatformVersion: "2.0.0", Services: []contracts.Service{{ID: "gateway", Command: "serve", Port: 4000}}},
	}
}
