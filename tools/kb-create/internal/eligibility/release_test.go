package eligibility

import (
	"os"
	"os/exec"
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

func TestCommitInput(t *testing.T) {
	project := t.TempDir()
	if changes, git := CommitInput(project); changes || git {
		t.Fatalf("CommitInput(non-git) = (%v, %v), want (false, false)", changes, git)
	}
	if err := exec.Command("git", "init", "-q", project).Run(); err != nil {
		t.Fatal(err)
	}
	if changes, git := CommitInput(project); changes || !git {
		t.Fatalf("CommitInput(clean) = (%v, %v), want (false, true)", changes, git)
	}
	if err := os.WriteFile(filepath.Join(project, "change.txt"), []byte("change"), 0o600); err != nil {
		t.Fatal(err)
	}
	if changes, git := CommitInput(project); !changes || !git {
		t.Fatalf("CommitInput(dirty) = (%v, %v), want (true, true)", changes, git)
	}
}

func writePackage(t *testing.T, dir, body string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}
