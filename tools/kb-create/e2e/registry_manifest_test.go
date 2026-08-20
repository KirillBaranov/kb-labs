package e2e

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	enginecatalog "github.com/kb-labs/create/internal/engine/catalog"
	installmanifest "github.com/kb-labs/create/internal/manifest"
)

// TestPlatformRegistryManifestBindsServiceTransport protects the E2E install
// catalog from the exact failure mode where the transport package is present
// in adapters but absent from adapterConfig.adapters. Installing a package is
// not enough: the declarative compiler only emits platform.adapters bindings
// from adapterConfig, and gateway bootstrap requires that binding to load the
// serviceTransport adapter.
func TestPlatformRegistryManifestBindsServiceTransport(t *testing.T) {
	_, sourceFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	manifestPath := filepath.Join(filepath.Dir(sourceFile), "..", "..", "..", "e2e", "platform", "registry-manifest.json")
	data, err := os.ReadFile(manifestPath) // #nosec G304 -- path is derived from this test source
	if err != nil {
		t.Fatalf("read E2E registry manifest: %v", err)
	}

	var source installmanifest.Manifest
	if err := json.Unmarshal(data, &source); err != nil {
		t.Fatalf("parse E2E registry manifest: %v", err)
	}

	const transportPackage = "@kb-labs/adapters-service-transport-http"
	installed := false
	for _, adapter := range source.Adapters {
		if adapter.Name == transportPackage {
			installed = true
			break
		}
	}
	if !installed {
		t.Fatalf("E2E registry manifest does not install %s", transportPackage)
	}

	catalog, err := enginecatalog.FromManifest(source)
	if err != nil {
		t.Fatalf("compile E2E registry manifest: %v", err)
	}
	provider, ok := catalog.Provider("serviceTransport")
	if !ok || provider.Package != transportPackage {
		t.Fatalf("compiled serviceTransport provider = %#v, present = %t; want %q", provider, ok, transportPackage)
	}
	bound := false
	for _, patch := range catalog.Defaults {
		if patch.Path == "/platform/adapters/serviceTransport" && string(patch.Value) == `"`+transportPackage+`"` {
			bound = true
			break
		}
	}
	if !bound {
		t.Fatalf("compiled catalog does not bind serviceTransport at /platform/adapters/serviceTransport")
	}
	if got := source.AdapterConfig.Adapters["serviceTransport"]; got != transportPackage {
		t.Fatalf("E2E registry manifest serviceTransport binding = %q, want %q", got, transportPackage)
	}
}
