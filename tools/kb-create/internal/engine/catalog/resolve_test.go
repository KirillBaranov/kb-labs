package catalog

import (
	"context"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestResolvePackageNormalizesPluginManifest(t *testing.T) {
	root := filepath.Join("testdata", "commit-package")
	resolved, err := ResolvePackage(context.Background(), root, ResolveOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Manifest.Kind != KindPlugin || resolved.Manifest.Package != "@fixture/commit-entry" {
		t.Fatalf("manifest = %#v", resolved.Manifest)
	}
	if len(resolved.Manifest.Requires) != 2 || resolved.Manifest.Requires[0].Capability != "cache" {
		t.Fatalf("requires = %#v", resolved.Manifest.Requires)
	}
	if resolved.Digest == "" || resolved.Path == "" {
		t.Fatalf("resolution = %#v", resolved)
	}
}

func TestResolveCatalogUsesPackageArtifactsAsTechnicalSource(t *testing.T) {
	catalog, err := ResolveCatalog(context.Background(), []string{filepath.Join("testdata", "commit-package")}, ResolveOptions{})
	if err != nil {
		t.Fatal(err)
	}
	component, ok := catalog.Component("plugin:@fixture/commit")
	if !ok || len(component.Requires) != 2 {
		t.Fatalf("catalog = %#v", catalog)
	}
}

func TestNormalizeAdapterManifestFeaturesAndSchema(t *testing.T) {
	manifest, err := NormalizeManifest([]byte(`{
      "manifestVersion":"1.0.0",
      "id":"openai-llm",
      "implements":"ILLM",
      "capabilities":{"streaming":true,"custom":{"functionCalling":true}},
      "configSchema":{"model":{"type":"string","default":"gpt-4o-mini"}}
    }`), "@fixture/openai", "1.0.0")
	if err != nil {
		t.Fatal(err)
	}
	if manifest.Kind != KindAdapter || len(manifest.Implements) != 1 || len(manifest.Capabilities) != 2 {
		t.Fatalf("manifest = %#v", manifest)
	}
	if string(manifest.ConfigSchema["model"].Default) != `"gpt-4o-mini"` {
		t.Fatalf("schema = %#v", manifest.ConfigSchema)
	}
}

func TestAddEntityDerivesProviderCapabilityFromAdapterManifest(t *testing.T) {
	catalog := Catalog{}
	entity, err := NormalizeManifest([]byte(`{"manifestVersion":"1.0.0","id":"redis-cache","implements":"ICache","capabilities":{"custom":{"ttl":true,"atomic":true}}}`), "@fixture/redis", "1.0.0")
	if err != nil {
		t.Fatal(err)
	}
	if err := catalog.AddEntity(entity); err != nil {
		t.Fatal(err)
	}
	if len(catalog.Providers) != 1 || catalog.Providers[0].Capability != "cache" || !HasFeatures(catalog.Providers[0], []string{"ttl", "atomic"}) {
		t.Fatalf("providers = %#v", catalog.Providers)
	}
	if catalog.Digest == "" {
		t.Fatal("catalog digest is empty")
	}
}

func TestAddEntityMapsAdapterDefaultsToCapabilityConfig(t *testing.T) {
	compiled := Catalog{}
	entity, err := NormalizeManifest([]byte(`{
      "manifestVersion":"1.0.0",
      "id":"openai-llm",
      "implements":"ILLM",
      "configSchema":{"model":{"type":"string","default":"gpt-4o-mini"}}
    }`), "@fixture/openai", "1.0.0")
	if err != nil {
		t.Fatal(err)
	}
	if err := compiled.AddEntity(entity); err != nil {
		t.Fatal(err)
	}
	if len(compiled.Providers) != 1 || len(compiled.Providers[0].Config) != 1 || compiled.Providers[0].Config[0].Path != "/adapterOptions/llm/model" {
		t.Fatalf("providers = %#v", compiled.Providers)
	}
}

func TestResolveRegistryPackageReadsLocalTarballWithoutLifecycleScripts(t *testing.T) {
	if _, err := exec.LookPath("npm"); err != nil {
		t.Skip("npm is not installed")
	}
	resolved, err := ResolveRegistryPackage(context.Background(), "./testdata/commit-package", RegistryOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Manifest.Kind != KindPlugin || resolved.Manifest.Package != "@fixture/commit-entry" || resolved.Digest == "" {
		t.Fatalf("resolved = %#v", resolved)
	}
}
