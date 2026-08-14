package release

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/kb-labs/create/v2/catalog"
	"github.com/kb-labs/create/v2/contracts"
)

func TestHydrateArtifactsUsesOnlyExactStagedValues(t *testing.T) {
	dir := t.TempDir()
	stage := filepath.Join(dir, "stage.json")
	if err := os.WriteFile(stage, []byte(`[{"name":"@kb/platform","version":"2.3.4","tarball":"platform.tgz","sha256":"sha"}]`), 0o600); err != nil {
		t.Fatal(err)
	}
	value, err := HydrateArtifacts(catalog.Catalog{
		Channels:  map[contracts.Channel]string{contracts.ChannelStable: "$platform"},
		Platforms: []catalog.PlatformBundle{{ID: "platform", Package: "@kb/platform", Profiles: map[string]contracts.ServiceGraph{"default": {}}}},
	}, stage)
	if err != nil {
		t.Fatal(err)
	}
	platform := value.Platforms[0]
	if platform.Version != "2.3.4" || platform.Tarball != "platform.tgz" || platform.SHA256 != "sha" || value.Channels[contracts.ChannelStable] != "2.3.4" {
		t.Fatalf("hydrated platform = %#v, channels = %#v", platform, value.Channels)
	}
}

func TestHydrateArtifactsRejectsTopologyPackageOutsideStage(t *testing.T) {
	dir := t.TempDir()
	stage := filepath.Join(dir, "stage.json")
	if err := os.WriteFile(stage, []byte(`[]`), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := HydrateArtifacts(catalog.Catalog{Platforms: []catalog.PlatformBundle{{ID: "platform", Package: "@kb/platform", Profiles: map[string]contracts.ServiceGraph{"default": {}}}}}, stage)
	if err == nil {
		t.Fatal("expected missing staged package rejection")
	}
}
