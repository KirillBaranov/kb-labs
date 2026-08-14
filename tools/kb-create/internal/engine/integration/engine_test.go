package integration

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kb-labs/create/internal/engine/bootstrap"
	"github.com/kb-labs/create/internal/engine/catalog"
	"github.com/kb-labs/create/internal/engine/config"
	"github.com/kb-labs/create/internal/engine/executor"
	"github.com/kb-labs/create/internal/engine/flow"
	"github.com/kb-labs/create/internal/engine/handlers"
	"github.com/kb-labs/create/internal/engine/plan"
	"github.com/kb-labs/create/internal/engine/scenario"
)

type packages struct{ installed map[string]bool }

func (p *packages) Installed(_ context.Context, pkg string) (bool, error) {
	return p.installed[pkg], nil
}
func (p *packages) Install(_ context.Context, pkg string) error { p.installed[pkg] = true; return nil }

type providers struct{ values map[string]string }

func (p *providers) Bound(_ context.Context, capability, provider string) (bool, error) {
	return p.values[capability] == provider, nil
}
func (p *providers) Bind(_ context.Context, capability, provider, _ string) error {
	p.values[capability] = provider
	return nil
}

func TestCommitScenarioRunsThroughPlanExecutorAndConfig(t *testing.T) {
	scenario, err := scenario.Load("commit")
	if err != nil {
		t.Fatal(err)
	}
	state, err := flow.New(scenario)
	if err != nil {
		t.Fatal(err)
	}
	request, err := flow.BuildInstallRequest(scenario, state, t.TempDir(), t.TempDir(), "catalog-test")
	if err != nil {
		t.Fatal(err)
	}
	cat := catalog.Catalog{Digest: "catalog-test", Outputs: []config.ConfigOutput{{Scope: config.ScopePlatform, Path: ".kb/kb.config.jsonc", Format: config.FormatJSONC}}, Components: []catalog.Component{{ID: "plugin:commit", Kind: "plugin", Package: "@kb-labs/commit-entry", Requires: []catalog.Requirement{{Capability: "cache", Features: []string{"kv"}}}, Config: []config.ConfigPatch{{ID: "commit.enabled", Scope: config.ScopePlatform, Operation: config.OperationSet, Path: "/plugins/commit/enabled", Value: json.RawMessage(`true`), Owner: "plugin:commit"}}}}, Providers: []catalog.Provider{{ID: "state-broker", Capability: "cache", Features: []string{"kv"}, Package: "@kb-labs/state-broker"}}}
	compiled, err := plan.Compile(request, cat)
	if err != nil {
		t.Fatal(err)
	}
	platform := request.PlatformRoot
	packages := &packages{installed: map[string]bool{}}
	providers := &providers{values: map[string]string{}}
	journal, err := executor.Run(context.Background(), compiled, handlers.Registry(handlers.RegistryOptions{Packages: packages, Providers: providers, Assembly: compiled.Assembly, Roots: config.Roots{config.RootPlatform: platform, config.RootProject: request.ProjectRoot}}), executor.Options{})
	if err != nil {
		t.Fatal(err)
	}
	if len(journal.Entries) != 3 || !packages.installed["@kb-labs/commit-entry"] || !packages.installed["@kb-labs/state-broker"] || providers.values["cache"] != "state-broker" {
		t.Fatalf("journal/packages/providers = %#v / %#v / %#v", journal, packages, providers)
	}
	data, err := os.ReadFile(filepath.Join(platform, ".kb", "kb.config.jsonc"))
	if err != nil {
		t.Fatal(err)
	}
	if string(data) == "" || !strings.Contains(string(data), `"enabled": true`) {
		t.Fatalf("config = %s", data)
	}
}

func TestAllScenarioFixturesHaveValidInstallProjection(t *testing.T) {
	for _, id := range scenario.IDs() {
		loaded, err := scenario.Load(id)
		if err != nil {
			t.Fatalf("%s: %v", id, err)
		}
		state, stateErr := flow.New(loaded)
		if stateErr != nil {
			t.Fatalf("%s state: %v", id, stateErr)
		}
		if _, requestErr := flow.BuildInstallRequest(loaded, state, t.TempDir(), t.TempDir(), "catalog-test"); requestErr != nil {
			t.Fatalf("%s install projection: %v", id, requestErr)
		}
	}
}

func TestCustomScenarioSelectsGatewayEffectIntoRuntimePlan(t *testing.T) {
	loaded, err := scenario.Load("custom")
	if err != nil {
		t.Fatal(err)
	}
	state, err := flow.New(loaded)
	if err != nil {
		t.Fatal(err)
	}
	request, err := flow.BuildInstallRequest(loaded, state, t.TempDir(), t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	if len(request.Effects) != 1 || request.Effects[0] != "gateway.access.local" {
		t.Fatalf("request effects = %#v", request.Effects)
	}
	cat, err := bootstrap.DefaultCatalog()
	if err != nil {
		t.Fatal(err)
	}
	compiled, err := plan.Compile(request, cat)
	if err != nil {
		t.Fatal(err)
	}
	for _, patch := range compiled.Assembly.Patches {
		if patch.ID == "gateway.access.local.auth" {
			if string(patch.Value) != "false" {
				t.Fatalf("local auth patch = %s", patch.Value)
			}
			return
		}
	}
	t.Fatalf("compiled plan has no local gateway auth effect: %#v", compiled.Assembly.Patches)
}

func TestDeclarativeProjectOutputUsesManagedOverlay(t *testing.T) {
	cat, err := bootstrap.DefaultCatalog()
	if err != nil {
		t.Fatal(err)
	}
	managedOverlay := false
	projectPointer := false
	for _, output := range cat.Outputs {
		if output.Scope != config.ScopeProject {
			continue
		}
		managedOverlay = managedOverlay || output.Path == ".kb/generated/kb-create.overlay.jsonc"
		projectPointer = projectPointer || output.Path == ".kb/kb.config.jsonc"
	}
	if !managedOverlay || !projectPointer {
		t.Fatalf("project outputs must include managed overlay and compatibility pointer: %#v", cat.Outputs)
	}
	request := plan.InstallRequest{Source: plan.SourceDirect, ProjectRoot: t.TempDir(), PlatformRoot: t.TempDir()}
	compiled, err := plan.Compile(request, cat)
	if err != nil {
		t.Fatal(err)
	}
	projectOutputs := 0
	for _, output := range compiled.Assembly.Outputs {
		if output.Scope == config.ScopeProject {
			projectOutputs++
		}
	}
	if projectOutputs != 2 {
		t.Fatalf("project outputs = %#v", compiled.Assembly.Outputs)
	}
}
