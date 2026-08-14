package release

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
)

func TestMaterializeManifestsReadsExactStagedTarball(t *testing.T) {
	dir := t.TempDir()
	tarball := "plugin.tgz"
	writeTarball(t, filepath.Join(dir, tarball), "package/dist/kb-create.manifest.json", `{"schema":"kb.create.artifact-manifest/v2","id":"plugin","package":"@kb/plugin","version":"1.2.3"}`)
	hash := tarballSHA256(t, filepath.Join(dir, tarball))
	stage := filepath.Join(dir, "manifest.json")
	if err := os.WriteFile(stage, []byte(`[{"name":"@kb/plugin","version":"1.2.3","tarball":"plugin.tgz","sha256":"`+hash+`"}]`), 0o600); err != nil {
		t.Fatal(err)
	}
	output := filepath.Join(dir, "manifests")
	artifacts, err := MaterializeManifests(stage, output)
	if err != nil || len(artifacts) != 1 {
		t.Fatalf("artifacts/error = %#v / %v", artifacts, err)
	}
	if _, err := os.Stat(filepath.Join(output, "node_modules", "@kb", "plugin", "kb-create.manifest.json")); err != nil {
		t.Fatalf("materialized manifest: %v", err)
	}
}

func TestMaterializeManifestsRejectsMissingTarballManifest(t *testing.T) {
	dir := t.TempDir()
	writeTarball(t, filepath.Join(dir, "empty.tgz"), "package/package.json", `{}`)
	hash := tarballSHA256(t, filepath.Join(dir, "empty.tgz"))
	stage := filepath.Join(dir, "manifest.json")
	if err := os.WriteFile(stage, []byte(`[{"name":"@kb/plugin","version":"1.2.3","tarball":"empty.tgz","sha256":"`+hash+`"}]`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := MaterializeManifests(stage, filepath.Join(dir, "out")); err == nil {
		t.Fatal("expected missing V2 manifest rejection")
	}
}

func TestMaterializeManifestsRejectsTamperedTarball(t *testing.T) {
	dir := t.TempDir()
	writeTarball(t, filepath.Join(dir, "plugin.tgz"), "package/kb-create.manifest.json", `{"schema":"kb.create.artifact-manifest/v2","id":"plugin","package":"@kb/plugin","version":"1.2.3"}`)
	stage := filepath.Join(dir, "manifest.json")
	if err := os.WriteFile(stage, []byte(`[{"name":"@kb/plugin","version":"1.2.3","tarball":"plugin.tgz","sha256":"0000000000000000000000000000000000000000000000000000000000000000"}]`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := MaterializeManifests(stage, filepath.Join(dir, "out")); err == nil {
		t.Fatal("expected staged tarball integrity rejection")
	}
}

func TestMaterializeManifestsOnlyRequiresTopologyPackages(t *testing.T) {
	dir := t.TempDir()
	writeTarball(t, filepath.Join(dir, "selected.tgz"), "package/kb-create.manifest.json", `{"schema":"kb.create.artifact-manifest/v2","id":"selected","package":"@kb/selected","version":"1.2.3"}`)
	writeTarball(t, filepath.Join(dir, "unrelated.tgz"), "package/package.json", `{}`)
	stage := filepath.Join(dir, "manifest.json")
	selectedHash := tarballSHA256(t, filepath.Join(dir, "selected.tgz"))
	unrelatedHash := tarballSHA256(t, filepath.Join(dir, "unrelated.tgz"))
	data := `[{"name":"@kb/selected","version":"1.2.3","tarball":"selected.tgz","sha256":"` + selectedHash + `"},{"name":"@kb/unrelated","version":"1.2.3","tarball":"unrelated.tgz","sha256":"` + unrelatedHash + `"}]`
	if err := os.WriteFile(stage, []byte(data), 0o600); err != nil {
		t.Fatal(err)
	}
	artifacts, err := MaterializeManifests(stage, filepath.Join(dir, "out"), "@kb/selected")
	if err != nil || len(artifacts) != 1 || artifacts[0].Name != "@kb/selected" {
		t.Fatalf("artifacts/error = %#v / %v", artifacts, err)
	}
}

func tarballSHA256(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func writeTarball(t *testing.T, path, name, content string) {
	t.Helper()
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	gzipWriter := gzip.NewWriter(file)
	tarWriter := tar.NewWriter(gzipWriter)
	if err := tarWriter.WriteHeader(&tar.Header{Name: name, Mode: 0o600, Size: int64(len(content))}); err != nil {
		t.Fatal(err)
	}
	if _, err := tarWriter.Write([]byte(content)); err != nil {
		t.Fatal(err)
	}
	if err := tarWriter.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gzipWriter.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
}
