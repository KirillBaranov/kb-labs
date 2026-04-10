package config

import "testing"

func TestTaskConfigResolveVariantPrefersCategoryMatchThenCatchAll(t *testing.T) {
	catchAllCache := true
	specificCache := false
	task := TaskConfig{
		{Command: "default", Cache: &catchAllCache},
		{Categories: []string{"tools"}, Command: "tool-build", Cache: &specificCache},
	}

	got := task.ResolveVariant("tools")
	if got == nil || got.Command != "tool-build" {
		t.Fatalf("ResolveVariant(tools) = %+v, want specific variant", got)
	}

	got = task.ResolveVariant("unknown")
	if got == nil || got.Command != "default" {
		t.Fatalf("ResolveVariant(unknown) = %+v, want catch-all", got)
	}
}

func TestFindCategoryAndGetDefaultPreset(t *testing.T) {
	ws := WorkspaceConfig{
		Categories: []NamedCategory{
			{Name: "libs", Category: CategoryConfig{Preset: "node-lib"}},
			{Name: "tools", Category: CategoryConfig{Preset: "go-binary"}},
		},
	}

	cat, ok := ws.FindCategory("tools")
	if !ok || cat.Preset != "go-binary" {
		t.Fatalf("FindCategory(tools) = (%+v, %v), want go-binary", cat, ok)
	}

	if _, ok := ws.FindCategory("missing"); ok {
		t.Fatal("FindCategory(missing) = true, want false")
	}

	preset, ok := GetDefaultPreset("node-lib")
	if !ok || preset.Language != "typescript" {
		t.Fatalf("GetDefaultPreset(node-lib) = (%+v, %v)", preset, ok)
	}
}
