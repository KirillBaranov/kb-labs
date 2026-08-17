package release

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/kb-labs/create/v2/catalog"
	"github.com/kb-labs/create/v2/doctor"
)

func TestEnrichWithManifestsReplacesReleaseConfigProjection(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "node_modules", "@kb", "platform")
	if err := os.MkdirAll(path, 0o750); err != nil {
		t.Fatal(err)
	}
	data := []byte(`{"schema":"kb.create.artifact-manifest/v2","id":"platform","package":"@kb/platform","version":"2.0.0","requirements":[{"id":"gateway.mode","path":"/gateway/mode","required":true,"default":"\"secure\""},{"id":"gateway.token","secret":true,"required":true,"env":"GATEWAY_TOKEN","services":["gateway"]}]}`)
	if err := os.WriteFile(filepath.Join(path, "kb-create.manifest.json"), data, 0o600); err != nil {
		t.Fatal(err)
	}
	source := catalog.Catalog{Platforms: []catalog.PlatformBundle{{ID: "platform", Package: "@kb/platform", Version: "2.0.0", Config: []catalog.ConfigRequirement{{ID: "stale"}}}}}
	got, err := EnrichWithManifests(source, root)
	if err != nil || len(got.Platforms[0].Config) != 2 || got.Platforms[0].Config[0].ID != "gateway.mode" || got.Platforms[0].Config[1].Env != "GATEWAY_TOKEN" {
		t.Fatalf("catalog/error = %#v / %v", got, err)
	}
}

func TestRequirementsRejectsSecretDefault(t *testing.T) {
	_, err := requirements([]doctor.Requirement{{ID: "token", Secret: true, Env: "TOKEN", Services: []string{"gateway"}, Default: []byte(`"unsafe"`)}})
	if err == nil {
		t.Fatal("expected secret default rejection")
	}
}
