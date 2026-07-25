package bootstrap

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/kb-labs/create/internal/engine/catalog"
)

func TestDefaultCatalogLoadsEmbeddedManifest(t *testing.T) {
	result, err := DefaultCatalog()
	if err != nil {
		t.Fatal(err)
	}
	if result.Digest == "" || len(result.Components) == 0 {
		t.Fatalf("catalog = %#v", result)
	}
}

func TestCatalogFromPackagesOverlaysPackageManifest(t *testing.T) {
	result, err := CatalogFromPackages(context.Background(), []string{filepath.Join("..", "catalog", "testdata", "commit-package")}, catalog.ResolveOptions{})
	if err != nil {
		t.Fatal(err)
	}
	component, ok := result.Component("plugin:@fixture/commit")
	if !ok || len(component.Requires) != 2 {
		t.Fatalf("component = %#v", component)
	}
}

func TestPackageSpecsForInstallIncludesSelectedComponentAndProviders(t *testing.T) {
	specs, err := PackageSpecsForInstall([]string{"plugin:commit"})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"@kb-labs/adapters-redis@latest", "@kb-labs/adapters-state-broker@latest", "@kb-labs/commit-entry@latest"}
	for _, expected := range want {
		found := false
		for _, actual := range specs {
			if actual == expected {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("specs = %v, missing %q", specs, expected)
		}
	}
}
