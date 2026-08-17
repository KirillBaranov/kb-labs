package installed

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/kb-labs/create/v2/contracts"
)

func TestDoctorInputRequiresExactInstalledManifest(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "node_modules", "@kb", "plugin")
	if err := os.MkdirAll(path, 0o750); err != nil {
		t.Fatal(err)
	}
	data := []byte(`{"schema":"kb.create.artifact-manifest/v2","id":"plugin","package":"@kb/plugin","version":"1.2.3","requirements":[{"id":"plugin.url","path":"/plugin/url","required":true,"hint":"set URL"},{"id":"plugin.token","secret":true,"required":true,"hint":"set token"}]}`)
	if err := os.WriteFile(filepath.Join(path, "kb-create.manifest.json"), data, 0o600); err != nil {
		t.Fatal(err)
	}
	input, err := DoctorInput(root, []contracts.Artifact{{ID: "plugin", Package: "@kb/plugin", Version: "1.2.3"}}, map[string]bool{})
	if err != nil || len(input.Manifests) != 1 || input.Manifests[0].Requirements[0].ID != "plugin.url" || input.Configured["plugin.token"] {
		t.Fatalf("input/error = %#v / %v", input, err)
	}
}

func TestDoctorInputRejectsMissingManifest(t *testing.T) {
	_, err := DoctorInput(t.TempDir(), []contracts.Artifact{{ID: "plugin", Package: "@kb/plugin", Version: "1.2.3"}}, map[string]bool{})
	if err == nil {
		t.Fatal("expected manifest integrity error")
	}
}
