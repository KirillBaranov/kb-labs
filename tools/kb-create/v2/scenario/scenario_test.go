package scenario

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kb-labs/create/v2/catalog"
	"github.com/kb-labs/create/v2/contracts"
	"github.com/kb-labs/create/v2/render"
	"github.com/kb-labs/create/v2/resolve"
)

func TestMigratedBuiltinsCompileToSharedV2Requests(t *testing.T) {
	ids, err := IDs()
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 5 {
		t.Fatalf("migrated scenario IDs = %#v", ids)
	}
	for _, id := range ids {
		t.Run(id, func(t *testing.T) {
			scenario, err := Load(id)
			if err != nil {
				t.Fatal(err)
			}
			state, err := New(scenario)
			if err != nil {
				t.Fatal(err)
			}
			base := contracts.InstallRequest{PlatformRoot: t.TempDir(), Platform: contracts.VersionSelector{Channel: contracts.ChannelStable}, ServiceProfile: "default", Source: contracts.SourceOffline, Policy: contracts.PolicyCompatible}
			request, err := Compile(scenario, state, base)
			if err != nil {
				t.Fatal(err)
			}
			if request.ScenarioID != id {
				t.Fatalf("request = %#v", request)
			}
			if _, err := resolve.Plan(request, source()); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestScenarioResumePersistsOnlyNonSecretAnswers(t *testing.T) {
	definition := Scenario{Schema: Schema, ID: "resume", Fields: []Field{{ID: "mode", Requirement: "mode", Type: "select", Default: []byte(`"local"`), Options: []Option{{Value: "local"}}}, {ID: "token", Requirement: "token", Type: "string", Secret: true, Required: true}}}
	state, err := New(definition)
	if err != nil {
		t.Fatal(err)
	}
	state, err = Answer(definition, state, "token", []byte(`"super-secret"`))
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	if err := SaveState(root, definition, state); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(root, ".kb", "v2", "scenarios", "resume.json"))
	if err != nil || strings.Contains(string(data), "super-secret") {
		t.Fatalf("state/error = %s / %v", data, err)
	}
	loaded, err := LoadState(root, definition)
	if err != nil || string(loaded.Answers["mode"]) != `"local"` || loaded.Answers["token"] != nil {
		t.Fatalf("loaded/error = %#v / %v", loaded, err)
	}
}

func TestScenarioValueRendersIntoManifestOwnedConfig(t *testing.T) {
	definition, err := Load("custom")
	if err != nil {
		t.Fatal(err)
	}
	state, err := New(definition)
	if err != nil {
		t.Fatal(err)
	}
	state, err = Answer(definition, state, "access.mode", []byte(`"local"`))
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	request, err := Compile(definition, state, contracts.InstallRequest{PlatformRoot: root, Platform: contracts.VersionSelector{Channel: contracts.ChannelStable}, ServiceProfile: "default", Source: contracts.SourceOffline, Policy: contracts.PolicyCompatible})
	if err != nil {
		t.Fatal(err)
	}
	plan, err := resolve.Plan(request, source())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := render.Write(plan); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(root, ".kb", "kb.config.jsonc"))
	if err != nil {
		t.Fatal(err)
	}
	var config map[string]any
	if err := json.Unmarshal(data, &config); err != nil {
		t.Fatal(err)
	}
	gateway := config["gateway"].(map[string]any)
	access := gateway["access"].(map[string]any)
	if access["mode"] != "local" {
		t.Fatalf("config = %#v", config)
	}
}

func TestScenarioRejectsUndeclaredConfigAndOption(t *testing.T) {
	scenario, err := Load("custom")
	if err != nil {
		t.Fatal(err)
	}
	state, err := New(scenario)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Answer(scenario, state, "access.mode", []byte(`"unsafe"`)); err == nil {
		t.Fatal("expected option validation")
	}
	state.Answers["unknown"] = []byte(`"value"`)
	request, err := Compile(scenario, state, contracts.InstallRequest{PlatformRoot: t.TempDir(), Platform: contracts.VersionSelector{Channel: contracts.ChannelStable}, ServiceProfile: "default", Source: contracts.SourceOffline, Policy: contracts.PolicyCompatible})
	if err != nil {
		t.Fatal(err)
	}
	request.Values["not.manifest"] = `"nope"`
	if _, err := resolve.Plan(request, source()); err == nil {
		t.Fatal("expected manifest-bound config rejection")
	}
}

func TestPagedScenarioCompilesConditionalAndSecretFields(t *testing.T) {
	definition := Scenario{
		Schema: Schema,
		ID:     "paged",
		Pages: []Page{{ID: "access", Sections: []Section{{ID: "main", Fields: []Field{
			{ID: "mode", Requirement: "gateway.access.mode", Type: "select", Default: []byte(`"local"`), Options: []Option{{Value: "local"}, {Value: "secured"}}},
			{ID: "token", Requirement: "gateway.token", Type: "string", Secret: true, When: &Predicate{Path: "mode", Equals: "secured"}},
		}}}}},
	}
	state, err := New(definition)
	if err != nil {
		t.Fatal(err)
	}
	request, err := Compile(definition, state, contracts.InstallRequest{PlatformRoot: t.TempDir(), Platform: contracts.VersionSelector{Channel: contracts.ChannelStable}, ServiceProfile: "default", Source: contracts.SourceOffline, Policy: contracts.PolicyCompatible})
	if err != nil {
		t.Fatal(err)
	}
	if request.Values["gateway.access.mode"] != `"local"` || len(request.SecretInputs) != 0 {
		t.Fatalf("request = %#v", request)
	}
	if len(VisiblePages(definition, state)) != 1 || len(VisibleFields(definition.Pages[0], state)) != 1 {
		t.Fatalf("visible pages/fields = %#v / %#v", VisiblePages(definition, state), VisibleFields(definition.Pages[0], state))
	}
}

func source() catalog.Catalog {
	return catalog.Catalog{Schema: catalog.Schema, Channels: map[contracts.Channel]string{contracts.ChannelStable: "2.0.0"}, Platforms: []catalog.PlatformBundle{{ID: "platform", Version: "2.0.0", Package: "@kb/platform", SHA256: "platform", Profiles: map[string]contracts.ServiceGraph{"default": {}}, Config: []catalog.ConfigRequirement{{ID: "gateway.access.mode", Path: "/gateway/access/mode", Default: `"secured"`}}}}, Plugins: []catalog.Component{{ID: "commit", Version: "1", Package: "@kb/commit", SHA256: "commit"}, {ID: "marketplace", Version: "1", Package: "@kb/marketplace", SHA256: "marketplace"}, {ID: "ai-review", Version: "1", Package: "@kb/review", SHA256: "review"}, {ID: "scaffold", Version: "1", Package: "@kb/scaffold", SHA256: "scaffold"}, {ID: "release", Version: "1", Package: "@kb/release", SHA256: "release"}}, Adapters: []catalog.Adapter{{Component: catalog.Component{ID: "state-broker", Version: "1", Package: "@kb/state", SHA256: "state"}, Provides: []string{"cache"}}}}
}
