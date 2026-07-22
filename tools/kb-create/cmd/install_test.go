package cmd

import (
	"strings"
	"testing"

	"github.com/kb-labs/create/internal/manifest"
)

func TestValidateComponentIDs_Unknown(t *testing.T) {
	known := []manifest.Component{{ID: "release"}, {ID: "commit"}}
	err := validateComponentIDs("plugin", []string{"release", "nonexistent"}, known)
	if err == nil {
		t.Fatal("expected error for unknown plugin id, got nil")
	}
	if !strings.Contains(err.Error(), `unknown plugin "nonexistent"`) {
		t.Errorf("error = %q, want it to name the unknown id", err.Error())
	}
	if !strings.Contains(err.Error(), "release") || !strings.Contains(err.Error(), "commit") {
		t.Errorf("error = %q, want it to list available ids", err.Error())
	}
}

func TestValidateComponentIDs_AllKnown(t *testing.T) {
	known := []manifest.Component{{ID: "release"}, {ID: "commit"}}
	if err := validateComponentIDs("plugin", []string{"release"}, known); err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestValidateComponentIDs_Empty(t *testing.T) {
	if err := validateComponentIDs("plugin", nil, nil); err != nil {
		t.Errorf("unexpected error for empty request: %v", err)
	}
}

func TestSplitCSV(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{"", nil},
		{"   ", nil},
		{"release", []string{"release"}},
		{"release,commit", []string{"release", "commit"}},
		{" release , commit ", []string{"release", "commit"}},
		{"release,,commit", []string{"release", "commit"}},
	}
	for _, c := range cases {
		got := splitCSV(c.in)
		if len(got) != len(c.want) {
			t.Errorf("splitCSV(%q) = %v, want %v", c.in, got, c.want)
			continue
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("splitCSV(%q) = %v, want %v", c.in, got, c.want)
				break
			}
		}
	}
}

func TestDescribeSelection(t *testing.T) {
	cases := []struct {
		plugins, services []string
		want              string
	}{
		{nil, nil, "0 packages"},
		{[]string{"release"}, nil, "1 plugin(s)"},
		{nil, []string{"workflow"}, "1 service(s)"},
		{[]string{"release", "commit"}, []string{"workflow"}, "2 plugin(s), 1 service(s)"},
	}
	for _, c := range cases {
		got := describeSelection(c.plugins, c.services)
		if got != c.want {
			t.Errorf("describeSelection(%v, %v) = %q, want %q", c.plugins, c.services, got, c.want)
		}
	}
}
