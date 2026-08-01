package deployment

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExportUsesJsonCompositionAndEmbedsProvisioner(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, ".kb"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".kb", "kb.config.json"), []byte(`{"services":{}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".kb", "marketplace.lock"), []byte(`{"schema":"kb.marketplace.lock/1","installed":{}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	writePackage(t, root, "example-runtime", "2.105.0")
	matrix := Matrix{Components: map[string]Component{
		"runtime": {Package: "example-runtime"},
	}, Rules: []Rule{{Component: "runtime", VersionRange: ">=2.105.0 <2.106.0"}}}
	output := filepath.Join(root, "export")

	if err := Export(root, "gateway", output, matrix); err != nil {
		t.Fatal(err)
	}

	for _, name := range []string{"kb.config.json", "marketplace.lock", "deployment.json", "compatibility.json", "Dockerfile", "kb-create"} {
		if _, err := os.Stat(filepath.Join(output, name)); err != nil {
			t.Errorf("export missing %s: %v", name, err)
		}
	}
	dockerfile, err := os.ReadFile(filepath.Join(output, "Dockerfile"))
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{
		"FROM ${KB_BASE_IMAGE}",
		"COPY --chown=1001:1001 kb-create",
		"RUN chmod +x /usr/local/bin/kb-create && kb-create deployment provision",
		"kb-create deployment provision",
		"/app/.kb/kb.config.json",
	} {
		if !strings.Contains(string(dockerfile), expected) {
			t.Errorf("Dockerfile does not contain %q:\n%s", expected, dockerfile)
		}
	}
	info, err := os.Stat(filepath.Join(output, "kb-create"))
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode()&0o111 == 0 {
		t.Fatal("embedded provisioner is not executable")
	}
}
