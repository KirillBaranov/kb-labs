package cmd

import (
	"reflect"
	"testing"
)

func TestParseServiceSpec(t *testing.T) {
	cases := []struct {
		in, pkg, ver string
		wantErr      bool
	}{
		{"@kb-labs/gateway@1.2.3", "@kb-labs/gateway", "1.2.3", false},
		{"@kb-labs/rest-api@2.0.0-beta.1", "@kb-labs/rest-api", "2.0.0-beta.1", false},
		{"pkg@1.0.0", "pkg", "1.0.0", false},
		{"no-version", "", "", true},
		{"@scope/no-version", "", "", true},
		{"", "", "", true},
	}
	for _, c := range cases {
		p, v, err := parseServiceSpec(c.in)
		if c.wantErr {
			if err == nil {
				t.Errorf("parseServiceSpec(%q) expected error", c.in)
			}
			continue
		}
		if err != nil {
			t.Errorf("parseServiceSpec(%q) unexpected error: %v", c.in, err)
		}
		if p != c.pkg || v != c.ver {
			t.Errorf("parseServiceSpec(%q) = (%q,%q), want (%q,%q)", c.in, p, v, c.pkg, c.ver)
		}
	}
}

func TestParseAdapters(t *testing.T) {
	got, err := parseAdapters("llm=@kb-labs/adapters-openai@0.4.1, cache=@kb-labs/adapters-redis@0.2.0")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := map[string]string{
		"llm":   "@kb-labs/adapters-openai@0.4.1",
		"cache": "@kb-labs/adapters-redis@0.2.0",
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestParseAdapters_Empty(t *testing.T) {
	got, err := parseAdapters("")
	if err != nil {
		t.Errorf("empty should be ok, got %v", err)
	}
	if got != nil {
		t.Errorf("empty should return nil, got %v", got)
	}
}

func TestParseAdapters_Errors(t *testing.T) {
	cases := []string{
		"no-equals-sign",
		"=spec",                               // empty role
		"role=",                               // empty spec
		"a=x,a=y",                             // duplicate role
		"=",                                   // both empty
	}
	for _, c := range cases {
		if _, err := parseAdapters(c); err == nil {
			t.Errorf("parseAdapters(%q) expected error", c)
		}
	}
}

func TestParsePlugins(t *testing.T) {
	got, err := parsePlugins("@kb-labs/marketplace@1.0.0,@kb-labs/other@2.3.4")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := map[string]string{
		"@kb-labs/marketplace": "1.0.0",
		"@kb-labs/other":       "2.3.4",
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestParsePlugins_Empty(t *testing.T) {
	got, err := parsePlugins("   ")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if got != nil {
		t.Errorf("expected nil, got %v", got)
	}
}
