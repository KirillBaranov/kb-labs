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
	if err := os.WriteFile(cfgPath, []byte("registry: r\ntargets: {}\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := Discover(tmp)
	if err != nil {
		t.Fatalf("Discover: %v", err)
	}
	if got != cfgPath {
		t.Fatalf("want %s, got %s", cfgPath, got)
	}

	// From a subdirectory.
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
	_, err := Discover(t.TempDir())
	if err == nil {
		t.Fatal("expected error when config missing")
	}
}

func TestRepoRoot(t *testing.T) {
	cases := []struct{ cfgPath, want string }{
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

func TestLoadExpandsEnv(t *testing.T) {
	tmp := t.TempDir()
	if err := os.WriteFile(filepath.Join(tmp, ".env"), []byte("SSH_HOST=myhost\nSSH_USER=deploy\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	yaml := `
registry: ghcr.io/test
targets:
  web:
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

	web := cfg.Targets["web"]
	if web.SSH.Host != "myhost" {
		t.Errorf("SSH.Host = %q, want myhost", web.SSH.Host)
	}
	if web.SSH.User != "deploy" {
		t.Errorf("SSH.User = %q, want deploy", web.SSH.User)
	}
}

func TestLoadRealEnvOverridesDotEnv(t *testing.T) {
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
