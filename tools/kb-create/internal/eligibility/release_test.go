package eligibility

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/kb-labs/create/internal/detect"
)

func TestReleaseEligible(t *testing.T) {
	project := t.TempDir()
	writePackage(t, project, `{"name":"app","version":"1.0.0","private":true}`)
	if ReleaseEligible(project, nil) {
		t.Fatal("private root package must not be release eligible")
	}
	packageDir := filepath.Join(project, "packages", "lib")
	if err := os.MkdirAll(packageDir, 0o750); err != nil {
		t.Fatal(err)
	}
	writePackage(t, packageDir, `{"name":"@example/lib","version":"1.0.0"}`)
	profile := &detect.ProjectProfile{Monorepo: &detect.MonorepoInfo{Packages: []detect.PackageInfo{{Path: "packages/lib"}}}}
	if !ReleaseEligible(project, profile) {
		t.Fatal("publishable workspace package must be release eligible")
	}
}

func writePackage(t *testing.T, dir, body string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}
