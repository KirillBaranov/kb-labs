package installservice

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestSplitSpec(t *testing.T) {
	cases := []struct {
		in, name, ver string
		wantErr       bool
	}{
		{"@kb-labs/adapters-openai@0.4.1", "@kb-labs/adapters-openai", "0.4.1", false},
		{"@kb-labs/gateway@1.2.3", "@kb-labs/gateway", "1.2.3", false},
		{"pkg@1.0.0", "pkg", "1.0.0", false},
		{"@scope/pkg@1.0.0", "@scope/pkg", "1.0.0", false},
		{"pkg-without-version", "", "", true},
		{"@scope/pkg-without-version", "", "", true},
	}
	for _, c := range cases {
		n, v, err := splitSpec(c.in)
		if c.wantErr {
			if err == nil {
				t.Errorf("splitSpec(%q) expected error, got name=%q ver=%q", c.in, n, v)
			}
			continue
		}
		if err != nil {
			t.Errorf("splitSpec(%q) unexpected error: %v", c.in, err)
			continue
		}
		if n != c.name || v != c.ver {
			t.Errorf("splitSpec(%q) = (%q,%q), want (%q,%q)", c.in, n, v, c.name, c.ver)
		}
	}
}

func TestBuildPackageJSON_IncludesAllDeps(t *testing.T) {
	specs, data, err := buildPackageJSON("gateway-1.0.0-abc", Options{
		ServicePkg: "@kb-labs/gateway",
		Version:    "1.0.0",
		Adapters: map[string]string{
			"llm":   "@kb-labs/adapters-openai@0.4.1",
			"cache": "@kb-labs/adapters-redis@0.2.0",
		},
		Plugins: map[string]string{
			"@kb-labs/marketplace": "1.0.0",
		},
	})
	if err != nil {
		t.Fatalf("buildPackageJSON: %v", err)
	}
	if len(specs) != 4 {
		t.Errorf("expected 4 specs (service + 2 adapters + 1 plugin), got %d: %v", len(specs), specs)
	}

	var parsed struct {
		Name         string            `json:"name"`
		Private      bool              `json:"private"`
		Dependencies map[string]string `json:"dependencies"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("parse generated package.json: %v", err)
	}
	if !strings.HasPrefix(parsed.Name, "kb-release-") {
		t.Errorf("unexpected name: %q", parsed.Name)
	}
	if !parsed.Private {
		t.Error("package.json should be private")
	}
	want := map[string]string{
		"@kb-labs/gateway":          "1.0.0",
		"@kb-labs/adapters-openai":  "0.4.1",
		"@kb-labs/adapters-redis":   "0.2.0",
		"@kb-labs/marketplace":      "1.0.0",
	}
	for k, v := range want {
		if got := parsed.Dependencies[k]; got != v {
			t.Errorf("deps[%q] = %q, want %q", k, got, v)
		}
	}
}

func TestValidate(t *testing.T) {
	cases := []struct {
		name    string
		opts    Options
		wantErr bool
	}{
		{"missing service", Options{Version: "1", PlatformDir: "/p"}, true},
		{"missing version", Options{ServicePkg: "s", PlatformDir: "/p"}, true},
		{"missing platform", Options{ServicePkg: "s", Version: "1"}, true},
		{"ok, keep defaults to 3",
			Options{ServicePkg: "s", Version: "1", PlatformDir: "/p"}, false},
	}
	for _, c := range cases {
		err := (&c.opts).validate()
		if (err != nil) != c.wantErr {
			t.Errorf("%s: err = %v, wantErr = %v", c.name, err, c.wantErr)
		}
		if !c.wantErr && c.opts.KeepReleases != 3 {
			t.Errorf("%s: KeepReleases default = %d, want 3", c.name, c.opts.KeepReleases)
		}
	}
}
