package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/kb-labs/create/v2/catalog"
)

func TestRunSealsNormalizedReleaseExport(t *testing.T) {
	dir := t.TempDir()
	input, output := filepath.Join(dir, "export.json"), filepath.Join(dir, "release", "index.json")
	manifestRoot := filepath.Join(dir, "staging")
	if err := os.WriteFile(input, []byte(`{"channels":{"stable":"$platform"},"platforms":[{"id":"platform","package":"@kb/platform","profiles":{"default":{}}}]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(manifestRoot, "node_modules", "@kb", "platform"), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(manifestRoot, "node_modules", "@kb", "platform", "kb-create.manifest.json"), []byte(`{"schema":"kb.create.artifact-manifest/v2","id":"platform","package":"@kb/platform","version":"2.0.0"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	stage := filepath.Join(dir, "stage.json")
	if err := os.WriteFile(stage, []byte(`[{"name":"@kb/platform","version":"2.0.0","tarball":"platform.tgz","sha256":"artifact"}]`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := run(input, output, manifestRoot, stage); err != nil {
		t.Fatal(err)
	}
	sealed, err := catalog.LoadFile(output)
	if err != nil || sealed.Digest == "" {
		t.Fatalf("sealed/error = %#v / %v", sealed, err)
	}
}

func TestRunRejectsMissingPublishPaths(t *testing.T) {
	if err := run("", "", "", ""); err == nil {
		t.Fatal("expected missing paths")
	}
}
