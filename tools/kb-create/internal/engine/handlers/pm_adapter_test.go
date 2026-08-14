package handlers

import (
	"context"
	"testing"

	"github.com/kb-labs/create/internal/pm"
)

type fakePM struct {
	installed []pm.InstalledPackage
	added     []string
	calls     int
}

func (f *fakePM) Name() string        { return "fake" }
func (f *fakePM) RegistryURL() string { return "" }
func (f *fakePM) Install(_ string, packages []string, progress chan<- pm.Progress) error {
	f.calls++
	f.added = append(f.added, packages...)
	if len(packages) > 0 {
		progress <- pm.Progress{Package: packages[0], Done: true}
	}
	close(progress)
	return nil
}
func (*fakePM) Update(string, []string, chan<- pm.Progress) error     { return nil }
func (*fakePM) Restore(string, chan<- pm.Progress) error              { return nil }
func (f *fakePM) ListInstalled(string) ([]pm.InstalledPackage, error) { return f.installed, nil }

func TestPMAdapterBridgesInstallAndInstalled(t *testing.T) {
	manager := &fakePM{installed: []pm.InstalledPackage{{Name: "@kb-labs/commit-entry", Version: "1.0.0"}}}
	adapter := &PMAdapter{Manager: manager, Dir: t.TempDir()}
	ok, err := adapter.Installed(context.Background(), "@kb-labs/commit-entry@latest")
	if err != nil || !ok {
		t.Fatalf("installed = %v / %v", ok, err)
	}
	ok, err = adapter.Installed(context.Background(), "@kb-labs/other@latest")
	if err != nil || ok {
		t.Fatalf("other = %v / %v", ok, err)
	}
	if err := adapter.Install(context.Background(), "@kb-labs/other@latest"); err != nil {
		t.Fatal(err)
	}
	if len(manager.added) != 1 || manager.added[0] != "@kb-labs/other@latest" {
		t.Fatalf("added = %#v", manager.added)
	}
}

func TestPMAdapterInstallsBatchInOnePackageManagerCall(t *testing.T) {
	manager := &fakePM{}
	adapter := &PMAdapter{Manager: manager, Dir: t.TempDir()}
	packages := []string{"@kb-labs/one@1.0.0", "@kb-labs/two@1.0.0"}
	if err := adapter.InstallMany(context.Background(), packages); err != nil {
		t.Fatal(err)
	}
	if manager.calls != 1 || len(manager.added) != 2 || manager.added[0] != packages[0] || manager.added[1] != packages[1] {
		t.Fatalf("calls/packages = %d / %#v", manager.calls, manager.added)
	}
}
