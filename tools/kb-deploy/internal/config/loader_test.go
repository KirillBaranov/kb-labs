package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDiscover(t *testing.T) {
	tmp := t.TempDir()
	kbDir := filepath.Join(tmp, ".kb")
	if err := os.Mkdir(kbDir, 0o755); err != nil {
		t.Fatal(err)
	}
	cfgPath := filepath.Join(kbDir, "deploy.yaml")
	if err := os.WriteFile(cfgPath, []byte("registry: ghcr.io/test\ntargets: {}\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Find from the root itself.
	got, err := Discover(tmp)
	if err != nil {
		t.Fatalf("Discover: %v", err)
	}
	if got != cfgPath {
		t.Fatalf("want %s, got %s", cfgPath, got)
	}

	// Find from a subdirectory.
	sub := filepath.Join(tmp, "a", "b")
	if err := os.MkdirAll(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	got, err = Discover(sub)
	if err != nil {
		t.Fatalf("Discover from subdir: %v", err)
	}
	if got != cfgPath {
		t.Fatalf("want %s, got %s", cfgPath, got)
	}
}

func TestDiscoverNotFound(t *testing.T) {
	tmp := t.TempDir()
	_, err := Discover(tmp)
	if err == nil {
		t.Fatal("expected error when config missing")
	}
}

func TestRepoRoot(t *testing.T) {
	cases := []struct {
		cfgPath string
		want    string
	}{
		{"/repo/.kb/deploy.yaml", "/repo"},
		{"/repo/deploy.yaml", "/repo"},
	}
	for _, c := range cases {
		got := RepoRoot(c.cfgPath)
		if got != c.want {
			t.Errorf("RepoRoot(%q) = %q, want %q", c.cfgPath, got, c.want)
		}
	}
}

func TestLoad(t *testing.T) {
	tmp := t.TempDir()

	// Write .env
	dotenv := "SSH_HOST=myhost.com\nSSH_USER=deploy\n"
	if err := os.WriteFile(filepath.Join(tmp, ".env"), []byte(dotenv), 0o644); err != nil {
		t.Fatal(err)
	}

	// Write config referencing env vars.
	yaml := `
registry: ghcr.io/test
targets:
  web:
    watch: ["sites/**"]
    image: web
    dockerfile: sites/web/Dockerfile
    context: sites/web
    ssh:
      host: ${SSH_HOST}
      user: ${SSH_USER}
      key_env: SSH_KEY
    remote:
      compose_file: ~/app/docker-compose.yml
      service: web
`
	cfgPath := filepath.Join(tmp, ".kb", "deploy.yaml")
	if err := os.MkdirAll(filepath.Dir(cfgPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(cfgPath, []byte(yaml), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg, err := Load(cfgPath, tmp)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if cfg.Registry != "ghcr.io/test" {
		t.Errorf("Registry = %q", cfg.Registry)
	}

	web, ok := cfg.Targets["web"]
	if !ok {
		t.Fatal("target 'web' missing")
	}
	if web.SSH.Host != "myhost.com" {
		t.Errorf("SSH.Host = %q, want myhost.com", web.SSH.Host)
	}
	if web.SSH.User != "deploy" {
		t.Errorf("SSH.User = %q, want deploy", web.SSH.User)
	}
	// dockerfile and context should be resolved to absolute paths.
	if !filepath.IsAbs(web.Dockerfile) {
		t.Errorf("Dockerfile not absolute: %s", web.Dockerfile)
	}
	if !filepath.IsAbs(web.Context) {
		t.Errorf("Context not absolute: %s", web.Context)
	}
}

func TestLoadEnvOverridesDotEnv(t *testing.T) {
	tmp := t.TempDir()

	if err := os.WriteFile(filepath.Join(tmp, ".env"), []byte("SSH_HOST=from-dotenv\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("SSH_HOST", "from-real-env")

	yaml := "registry: r\ntargets:\n  x:\n    ssh:\n      host: ${SSH_HOST}\n      user: u\n      key_env: K\n    remote:\n      compose_file: f\n      service: s\n"
	cfgPath := filepath.Join(tmp, ".kb", "deploy.yaml")
	if err := os.MkdirAll(filepath.Dir(cfgPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(cfgPath, []byte(yaml), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg, err := Load(cfgPath, tmp)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Targets["x"].SSH.Host != "from-real-env" {
		t.Errorf("expected real env to win, got %q", cfg.Targets["x"].SSH.Host)
	}
}

func TestLoadDotEnv(t *testing.T) {
	cases := []struct {
		content string
		key     string
		want    string
	}{
		{"KEY=value\n", "KEY", "value"},
		{"KEY=\"quoted\"\n", "KEY", "quoted"},
		{"KEY='single'\n", "KEY", "single"},
		{"# comment\nKEY=val\n", "KEY", "val"},
		{"KEY=val # inline comment\n", "KEY", "val # inline comment"}, // inline not stripped (by design)
	}
	for _, c := range cases {
		tmp := t.TempDir()
		p := filepath.Join(tmp, ".env")
		if err := os.WriteFile(p, []byte(c.content), 0o644); err != nil {
			t.Fatal(err)
		}
		env := loadDotEnv(p)
		if env[c.key] != c.want {
			t.Errorf("content=%q key=%q: got %q, want %q", c.content, c.key, env[c.key], c.want)
		}
	}
}
