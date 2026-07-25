package catalog

import (
	"context"
	"path/filepath"
	"testing"
)

func TestResolvePackageCachedReusesManifestByPackageVersion(t *testing.T) {
	cache := ManifestCache{Dir: t.TempDir()}
	packageDir := filepath.Join("testdata", "commit-package")
	first, err := ResolvePackageCached(context.Background(), packageDir, ResolveOptions{}, cache)
	if err != nil {
		t.Fatal(err)
	}
	second, err := ResolvePackageCached(context.Background(), packageDir, ResolveOptions{"missing-node"}, cache)
	if err != nil {
		t.Fatal(err)
	}
	if first.Digest != second.Digest || second.Manifest.Package != "@fixture/commit-entry" {
		t.Fatalf("first=%#v second=%#v", first, second)
	}
}
