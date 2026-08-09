package cmd

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/kb-labs/create/internal/manifest"
)

// TestResolveProjectDir_ExplicitWinsOverPersistedAndCWD guards against a
// regression introduced by the declarative launcher cutover: `kb-create
// <name> --yes --dev-manifest ...` (used by e2e/platform/entrypoint.sh)
// resolved a project directory from its positional argument but then
// silently installed into os.Getwd() instead, because runDeclarativeInstall
// ignored that resolved directory entirely. The project directory named on
// the command line (bridged in via flagInstallProjectRoot) must always win,
// even when a previous install recorded a different project (persistedCWD)
// or the process happens to be sitting in some other cwd.
func TestResolveProjectDir_ExplicitWinsOverPersistedAndCWD(t *testing.T) {
	explicit := filepath.Join(t.TempDir(), "kb-e2e")
	got, err := resolveProjectDir(explicit, "/persisted/project", "/some/cwd")
	if err != nil {
		t.Fatalf("resolveProjectDir() error = %v", err)
	}
	want, _ := filepath.Abs(explicit)
	if got != want {
		t.Errorf("resolveProjectDir(explicit=%q) = %q, want %q (explicit must win)", explicit, got, want)
	}
}

func TestResolveProjectDir_FallsBackToPersistedWhenNoExplicit(t *testing.T) {
	got, err := resolveProjectDir("", "/persisted/project", "/some/cwd")
	if err != nil {
		t.Fatalf("resolveProjectDir() error = %v", err)
	}
	if got != "/persisted/project" {
		t.Errorf("resolveProjectDir() = %q, want persisted project dir", got)
	}
}

func TestResolveProjectDir_FallsBackToCWDWhenNoExplicitOrPersisted(t *testing.T) {
	got, err := resolveProjectDir("", "", "/some/cwd")
	if err != nil {
		t.Fatalf("resolveProjectDir() error = %v", err)
	}
	if got != "/some/cwd" {
		t.Errorf("resolveProjectDir() = %q, want cwd", got)
	}
}

func TestResolveProjectDir_ErrorsWhenNothingAvailable(t *testing.T) {
	if _, err := resolveProjectDir("", "", ""); err == nil {
		t.Fatal("resolveProjectDir() expected error when explicit, persisted, and cwd are all empty")
	}
}

func TestDefaultBinaryIDs(t *testing.T) {
	got := defaultBinaryIDs(&manifest.Manifest{Binaries: []manifest.Binary{
		{ID: "kb-devkit", Default: false},
		{ID: "kb-dev", Default: true},
		{ID: "kb-create", Default: true},
	}})
	want := []string{"kb-create", "kb-dev"}
	if len(got) != len(want) {
		t.Fatalf("defaultBinaryIDs() = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("defaultBinaryIDs() = %v, want %v", got, want)
		}
	}
}

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

func TestSplitVersionedIDs(t *testing.T) {
	ids, versions := splitVersionedIDs("release@0.2.0,commit,workflow@1.3.0")
	wantIDs := []string{"release", "commit", "workflow"}
	if len(ids) != len(wantIDs) {
		t.Fatalf("ids = %v, want %v", ids, wantIDs)
	}
	for i := range ids {
		if ids[i] != wantIDs[i] {
			t.Errorf("ids[%d] = %q, want %q", i, ids[i], wantIDs[i])
		}
	}
	if versions["release"] != "0.2.0" {
		t.Errorf(`versions["release"] = %q, want "0.2.0"`, versions["release"])
	}
	if versions["workflow"] != "1.3.0" {
		t.Errorf(`versions["workflow"] = %q, want "1.3.0"`, versions["workflow"])
	}
	if _, ok := versions["commit"]; ok {
		t.Errorf("commit has no version pin, should not appear in versions map")
	}
}

func TestSplitVersionedIDs_NoVersions(t *testing.T) {
	ids, versions := splitVersionedIDs("release,commit")
	if len(ids) != 2 || ids[0] != "release" || ids[1] != "commit" {
		t.Errorf("ids = %v, want [release commit]", ids)
	}
	if versions != nil {
		t.Errorf("versions = %v, want nil when nothing is pinned", versions)
	}
}

func TestSplitVersionedIDs_Empty(t *testing.T) {
	ids, versions := splitVersionedIDs("")
	if ids != nil || versions != nil {
		t.Errorf("ids=%v versions=%v, want both nil for empty input", ids, versions)
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

func TestMergeIDsPreservesExistingSelectionAndDeduplicates(t *testing.T) {
	got := mergeIDs([]string{"release", "commit"}, []string{"commit", "workflow"})
	want := []string{"release", "commit", "workflow"}
	if len(got) != len(want) {
		t.Fatalf("mergeIDs() = %v, want %v", got, want)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Fatalf("mergeIDs() = %v, want %v", got, want)
		}
	}
}
