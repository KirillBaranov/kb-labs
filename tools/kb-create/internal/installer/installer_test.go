package installer

import (
	"testing"

	"github.com/kb-labs/create/internal/logger"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/pm"
)

// fakePM and discardLogger are shared with repair_test.go.
type fakePM struct {
	failErr  error
	name     string
	registry string
	failOn   string
	calls    []string
}

func (f *fakePM) Name() string        { return f.name }
func (f *fakePM) RegistryURL() string { return f.registry }

func (f *fakePM) Install(dir string, pkgs []string, ch chan<- pm.Progress) error {
	for _, p := range pkgs {
		f.calls = append(f.calls, "install:"+p)
		if f.failOn == p {
			return f.failErr
		}
	}
	return nil
}

func (f *fakePM) Update(dir string, pkgs []string, ch chan<- pm.Progress) error {
	for _, p := range pkgs {
		f.calls = append(f.calls, "update:"+p)
	}
	return nil
}

func (f *fakePM) Restore(dir string, ch chan<- pm.Progress) error {
	f.calls = append(f.calls, "restore")
	return f.failErr
}

func (f *fakePM) ListInstalled(dir string) ([]pm.InstalledPackage, error) {
	return nil, nil
}

func discardLogger() *logger.Logger {
	return logger.NewDiscard()
}

// The declarative-engine cutover (see
// docs/plans/2026-08-19-kb-create-engine-unification-implementation.md)
// moved FinalizeDeclarative/Install/Diff/Update and everything they tested
// into internal/engine/plan, internal/engine/handlers, and
// internal/engine/integration — see those packages' tests for install/update
// coverage. This package now only carries repair.go's dependencies
// (installBinaries, symlinkCLI, which internal/engine/handlers duplicates
// for the declarative path) plus the Selection/Result data-transfer types
// still used by internal/wizard and cmd/*.go.

func TestHasChangesEmpty(t *testing.T) {
	d := &UpdateDiff{}
	if d.HasChanges() {
		t.Error("HasChanges() = true for empty diff, want false")
	}
}

func TestHasChangesAdded(t *testing.T) {
	d := &UpdateDiff{Added: []string{"pkg"}}
	if !d.HasChanges() {
		t.Error("HasChanges() = false with Added entries, want true")
	}
}

func TestFilterBinariesAll(t *testing.T) {
	bins := []manifest.Binary{{ID: "kb-dev"}, {ID: "kb-devkit"}}
	got := filterBinaries(bins, nil)
	if len(got) != 2 {
		t.Fatalf("filterBinaries(nil) = %v, want all %d binaries", got, len(bins))
	}
}

func TestFilterBinariesSubset(t *testing.T) {
	bins := []manifest.Binary{{ID: "kb-dev"}, {ID: "kb-devkit"}}
	got := filterBinaries(bins, []string{"kb-dev"})
	if len(got) != 1 || got[0].ID != "kb-dev" {
		t.Fatalf("filterBinaries(%v) = %v, want only kb-dev", []string{"kb-dev"}, got)
	}
}

func TestFilterBinariesUnknownIDYieldsNone(t *testing.T) {
	bins := []manifest.Binary{{ID: "kb-dev"}}
	got := filterBinaries(bins, []string{"does-not-exist"})
	if len(got) != 0 {
		t.Fatalf("filterBinaries() = %v, want empty for an unknown selected id", got)
	}
}
