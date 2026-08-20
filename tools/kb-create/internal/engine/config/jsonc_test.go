package config

import (
	"encoding/json"
	"strings"
	"testing"
)

func rawJSON(t *testing.T, v any) json.RawMessage {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return data
}

func TestRenderOrderedJSONC_SectionOrderAndComments(t *testing.T) {
	patches := []ConfigPatch{
		{ID: "p1", Scope: ScopePlatform, Operation: OperationSet, Path: "/plugins/commit/enabled", Value: rawJSON(t, true), Doc: "commit plugin", Owner: "test"},
		{ID: "p2", Scope: ScopePlatform, Operation: OperationSet, Path: "/platform/dir", Value: rawJSON(t, "/opt/kb-platform"), Doc: "Path to the platform installation.", Owner: "test"},
		{ID: "p3", Scope: ScopePlatform, Operation: OperationSet, Path: "/services/gateway", Value: rawJSON(t, true), Owner: "test"},
	}
	out, err := RenderOrderedJSONC(patches, ScopePlatform, []string{"platform", "services", "plugins"}, "// banner\n")
	if err != nil {
		t.Fatalf("RenderOrderedJSONC() error = %v", err)
	}
	text := string(out)

	// section order: platform before services before plugins, regardless of patch order
	platformIdx := strings.Index(text, `"platform"`)
	servicesIdx := strings.Index(text, `"services"`)
	pluginsIdx := strings.Index(text, `"plugins"`)
	if !(platformIdx < servicesIdx && servicesIdx < pluginsIdx) {
		t.Errorf("section order wrong, got:\n%s", text)
	}
	if !strings.Contains(text, "// Path to the platform installation.") {
		t.Errorf("missing doc comment for platform.dir:\n%s", text)
	}
	if !strings.Contains(text, "// commit plugin") {
		t.Errorf("missing doc comment for plugins.commit:\n%s", text)
	}
	if !strings.HasPrefix(text, "// banner\n") {
		t.Errorf("missing banner at top:\n%s", text)
	}

	// must be valid JSON once comments are stripped (reuse existing stripJSONC)
	var parsed map[string]any
	if err := json.Unmarshal(stripJSONC(out), &parsed); err != nil {
		t.Fatalf("rendered JSONC does not parse as JSON after stripping comments: %v\n%s", err, text)
	}
	platform, ok := parsed["platform"].(map[string]any)
	if !ok || platform["dir"] != "/opt/kb-platform" {
		t.Errorf("platform.dir not round-tripped correctly, got %#v", parsed["platform"])
	}
}

func TestRenderOrderedJSONC_UnlistedSectionAppendedNotDropped(t *testing.T) {
	patches := []ConfigPatch{
		{ID: "p1", Scope: ScopePlatform, Operation: OperationSet, Path: "/unknownSection/x", Value: rawJSON(t, 1), Owner: "test"},
		{ID: "p2", Scope: ScopePlatform, Operation: OperationSet, Path: "/platform/dir", Value: rawJSON(t, "x"), Owner: "test"},
	}
	out, err := RenderOrderedJSONC(patches, ScopePlatform, []string{"platform"}, "")
	if err != nil {
		t.Fatalf("RenderOrderedJSONC() error = %v", err)
	}
	if !strings.Contains(string(out), `"unknownSection"`) {
		t.Errorf("a top-level key absent from sectionOrder must still be rendered, not dropped:\n%s", out)
	}
}

func TestRenderOrderedJSONC_RemoveOperation(t *testing.T) {
	patches := []ConfigPatch{
		{ID: "p1", Scope: ScopePlatform, Operation: OperationSet, Path: "/platform/dir", Value: rawJSON(t, "x"), Owner: "test"},
		{ID: "p2", Scope: ScopePlatform, Operation: OperationRemove, Path: "/platform/dir", Owner: "test"},
	}
	out, err := RenderOrderedJSONC(patches, ScopePlatform, nil, "")
	if err != nil {
		t.Fatalf("RenderOrderedJSONC() error = %v", err)
	}
	var parsed map[string]any
	if err := json.Unmarshal(stripJSONC(out), &parsed); err != nil {
		t.Fatalf("invalid JSON after remove: %v\n%s", err, out)
	}
	if platform, ok := parsed["platform"].(map[string]any); ok {
		if _, exists := platform["dir"]; exists {
			t.Errorf("removed key still present:\n%s", out)
		}
	}
}

func TestRenderOrderedJSONC_ScopeFiltering(t *testing.T) {
	patches := []ConfigPatch{
		{ID: "p1", Scope: ScopePlatform, Operation: OperationSet, Path: "/a", Value: rawJSON(t, 1), Owner: "test"},
		{ID: "p2", Scope: ScopeProject, Operation: OperationSet, Path: "/b", Value: rawJSON(t, 2), Owner: "test"},
	}
	out, err := RenderOrderedJSONC(patches, ScopePlatform, nil, "")
	if err != nil {
		t.Fatalf("RenderOrderedJSONC() error = %v", err)
	}
	if strings.Contains(string(out), `"b"`) {
		t.Errorf("project-scoped patch leaked into platform-scoped render:\n%s", out)
	}
}
