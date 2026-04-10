package config

import (
	"os"
	"path/filepath"
	"testing"
)

// mkdirAll creates nested directories and returns the leaf path.
func mkdirAll(t *testing.T, parts ...string) string {
	t.Helper()
	path := filepath.Join(parts...)
	if err := os.MkdirAll(path, 0o755); err != nil {
		t.Fatal(err)
	}
	return path
}

func writeFile(t *testing.T, path string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(minimalYAMLContent), 0o600); err != nil {
		t.Fatal(err)
	}
}

// minimalYAMLContent is a valid devservices.yaml for use in discovery tests.
const minimalYAMLContent = `
name: test
services:
  api:
    command: pnpm dev
    port: 3000
`

// TestDiscoverFindsKBLabsYAML verifies that .kb/devservices.yaml is found.
func TestDiscoverFindsKBLabsYAML(t *testing.T) {
	root := t.TempDir()
	kbDir := mkdirAll(t, root, ".kb")
	writeFile(t, filepath.Join(kbDir, "devservices.yaml"))

	got, err := Discover(root)
	if err != nil {
		t.Fatalf("Discover() error: %v", err)
	}
	want := filepath.Join(root, ".kb", "devservices.yaml")
	if got != want {
		t.Errorf("Discover() = %q, want %q", got, want)
	}
}

func TestDiscoverFindsRootYAML(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "devservices.yaml"))

	got, err := Discover(root)
	if err != nil {
		t.Fatalf("Discover() error: %v", err)
	}
	want := filepath.Join(root, "devservices.yaml")
	if got != want {
		t.Errorf("Discover() = %q, want %q", got, want)
	}
}

func TestDiscoverFindsYML(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "devservices.yml"))

	got, err := Discover(root)
	if err != nil {
		t.Fatalf("Discover() error: %v", err)
	}
	want := filepath.Join(root, "devservices.yml")
	if got != want {
		t.Errorf("Discover() = %q, want %q", got, want)
	}
}

// TestDiscoverKBLabsWinsOverRoot verifies that .kb/devservices.yaml takes
// priority over a root-level devservices.yaml in the same directory.
func TestDiscoverKBLabsWinsOverRoot(t *testing.T) {
	root := t.TempDir()
	kbDir := mkdirAll(t, root, ".kb")
	writeFile(t, filepath.Join(kbDir, "devservices.yaml"))
	writeFile(t, filepath.Join(root, "devservices.yaml"))

	got, err := Discover(root)
	if err != nil {
		t.Fatalf("Discover() error: %v", err)
	}
	want := filepath.Join(root, ".kb", "devservices.yaml")
	if got != want {
		t.Errorf("Discover() = %q, want %q (.kb/ should win)", got, want)
	}
}

// TestDiscoverWalksUp verifies that discovery walks up the directory tree.
func TestDiscoverWalksUp(t *testing.T) {
	root := t.TempDir()
	kbDir := mkdirAll(t, root, ".kb")
	writeFile(t, filepath.Join(kbDir, "devservices.yaml"))

	subDir := mkdirAll(t, root, "packages", "my-service")

	got, err := Discover(subDir)
	if err != nil {
		t.Fatalf("Discover() error: %v", err)
	}
	want := filepath.Join(root, ".kb", "devservices.yaml")
	if got != want {
		t.Errorf("Discover() = %q, want %q", got, want)
	}
}

// TestDiscoverClosestWins verifies the closest config wins when configs exist at multiple levels.
func TestDiscoverClosestWins(t *testing.T) {
	root := t.TempDir()
	kbDir := mkdirAll(t, root, ".kb")
	writeFile(t, filepath.Join(kbDir, "devservices.yaml"))

	subRoot := mkdirAll(t, root, "sub-project")
	writeFile(t, filepath.Join(subRoot, "devservices.yaml"))

	got, err := Discover(subRoot)
	if err != nil {
		t.Fatalf("Discover() error: %v", err)
	}
	want := filepath.Join(subRoot, "devservices.yaml")
	if got != want {
		t.Errorf("Discover() = %q, want %q (closer config should win)", got, want)
	}
}

func TestDiscoverNotFound(t *testing.T) {
	dir := t.TempDir()
	_, err := Discover(dir)
	if err == nil {
		t.Fatal("expected error when no config found, got nil")
	}
}

// TestRootDirForKBLabsYAML verifies RootDir strips the .kb/ component.
func TestRootDirForKBLabsYAML(t *testing.T) {
	root := t.TempDir()
	configPath := filepath.Join(root, ".kb", "devservices.yaml")

	got := RootDir(configPath)
	if got != root {
		t.Errorf("RootDir(%q) = %q, want %q", configPath, got, root)
	}
}

// TestRootDirForRootYAML verifies RootDir returns the directory containing the YAML.
func TestRootDirForRootYAML(t *testing.T) {
	root := t.TempDir()
	configPath := filepath.Join(root, "devservices.yaml")

	got := RootDir(configPath)
	if got != root {
		t.Errorf("RootDir(%q) = %q, want %q", configPath, got, root)
	}
}
