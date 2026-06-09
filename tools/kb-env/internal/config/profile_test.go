package config

import "testing"

func TestParseValid(t *testing.T) {
	tb, err := Parse([]byte(`
schemaVersion: 1
profiles:
  mind:
    description: RAG
    plugins: [mind, marketplace]
    services: [rest, gateway]
`))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	p, err := tb.Get("mind")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if len(p.Plugins) != 2 || p.Plugins[0] != "mind" {
		t.Errorf("plugins = %v", p.Plugins)
	}
}

func TestParseRejectsBadSchema(t *testing.T) {
	if _, err := Parse([]byte("schemaVersion: 2\nprofiles: {x: {}}")); err == nil {
		t.Error("expected error on schemaVersion 2")
	}
}

func TestGetUnknownProfile(t *testing.T) {
	tb, _ := Parse([]byte("schemaVersion: 1\nprofiles: {mind: {description: x}}"))
	if _, err := tb.Get("nope"); err == nil {
		t.Error("expected error for unknown profile")
	}
}

func TestOverlayPath(t *testing.T) {
	tb := &Testbed{SourceDir: "/ws/e2e/testbed"}
	// no overlay
	if p, err := tb.OverlayPath(Profile{}); err != nil || p != "" {
		t.Errorf("empty config: got (%q,%v), want (\"\",nil)", p, err)
	}
	// relative overlay resolved against SourceDir
	got, err := tb.OverlayPath(Profile{Config: "overlays/hyde-on.jsonc"})
	if err != nil || got != "/ws/e2e/testbed/overlays/hyde-on.jsonc" {
		t.Errorf("resolved = %q, err = %v", got, err)
	}
	// embedded testbed (no SourceDir) with a config set → error
	emb := &Testbed{}
	if _, err := emb.OverlayPath(Profile{Config: "x.jsonc"}); err == nil {
		t.Error("expected error for overlay on embedded testbed")
	}
}

func TestEmbeddedDefaults(t *testing.T) {
	tb, err := Parse(embeddedTestbed)
	if err != nil {
		t.Fatalf("embedded testbed invalid: %v", err)
	}
	for _, name := range []string{"mind", "combo", "release-set"} {
		if _, err := tb.Get(name); err != nil {
			t.Errorf("missing embedded profile %q", name)
		}
	}
}

// TestMarketplacePluginImpliesService guards the rule that a profile installing
// the marketplace plugin must also run the marketplace service — otherwise
// `kb marketplace plugins list` (and friends) hit a dead :5070 with ECONNREFUSED.
func TestMarketplacePluginImpliesService(t *testing.T) {
	tb, err := Parse(embeddedTestbed)
	if err != nil {
		t.Fatalf("embedded testbed invalid: %v", err)
	}
	has := func(xs []string, v string) bool {
		for _, x := range xs {
			if x == v {
				return true
			}
		}
		return false
	}
	for _, name := range tb.Names() {
		p, _ := tb.Get(name)
		if has(p.Plugins, "marketplace") && !has(p.Services, "marketplace") {
			t.Errorf("profile %q installs the marketplace plugin but does not run the marketplace service", name)
		}
	}
}
