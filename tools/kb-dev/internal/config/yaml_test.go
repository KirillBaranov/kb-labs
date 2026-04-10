package config

import (
	"os"
	"path/filepath"
	"testing"
)

// writeYAML writes content to a devservices.yaml in a temp dir and returns its path.
func writeYAML(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "devservices.yaml")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

const minimalYAML = `
name: test-project

services:
  postgres:
    name: PostgreSQL
    command: docker run -p 5432:5432 postgres
    port: 5432
    type: docker
    health_check: http://localhost:5432

  api:
    name: API Server
    command: pnpm dev
    port: 3000
    depends_on: [postgres]
    group: app
`

func TestLoadYAMLMinimal(t *testing.T) {
	path := writeYAML(t, minimalYAML)
	cfg, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile() error: %v", err)
	}

	if len(cfg.Services) != 2 {
		t.Errorf("got %d services, want 2", len(cfg.Services))
	}
	if cfg.Name != "test-project" {
		t.Errorf("Name = %q, want test-project", cfg.Name)
	}
}

func TestLoadYAMLAppliesDefaults(t *testing.T) {
	path := writeYAML(t, minimalYAML)
	cfg, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile() error: %v", err)
	}

	if cfg.Settings.LogsDir != ".kb/logs/tmp" {
		t.Errorf("LogsDir = %q, want .kb/logs/tmp", cfg.Settings.LogsDir)
	}
	if cfg.Settings.PIDDir != ".kb/tmp" {
		t.Errorf("PIDDir = %q, want .kb/tmp", cfg.Settings.PIDDir)
	}
	if cfg.Settings.StartTimeout != 30000 {
		t.Errorf("StartTimeout = %d, want 30000", cfg.Settings.StartTimeout)
	}
}

func TestLoadYAMLServiceType(t *testing.T) {
	path := writeYAML(t, minimalYAML)
	cfg, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile() error: %v", err)
	}

	if cfg.Services["postgres"].Type != ServiceTypeDocker {
		t.Errorf("postgres type = %q, want docker", cfg.Services["postgres"].Type)
	}
	if cfg.Services["api"].Type != ServiceTypeNode {
		t.Errorf("api type = %q, want node", cfg.Services["api"].Type)
	}
}

func TestLoadYAMLDependsOn(t *testing.T) {
	path := writeYAML(t, minimalYAML)
	cfg, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile() error: %v", err)
	}

	deps := cfg.Services["api"].DependsOn
	if len(deps) != 1 || deps[0] != "postgres" {
		t.Errorf("api.DependsOn = %v, want [postgres]", deps)
	}
}

func TestLoadYAMLGroupInferredFromServiceField(t *testing.T) {
	path := writeYAML(t, minimalYAML)
	cfg, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile() error: %v", err)
	}

	// api declares group: app → should appear in cfg.Groups["app"]
	members, ok := cfg.Groups["app"]
	if !ok {
		t.Fatal("group 'app' not found in Groups")
	}
	found := false
	for _, m := range members {
		if m == "api" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("Groups['app'] = %v, expected to contain 'api'", members)
	}
}

func TestLoadYAMLExplicitGroupNotDuplicated(t *testing.T) {
	content := `
name: test

groups:
  app: [api]

services:
  api:
    command: pnpm dev
    port: 3000
    group: app
`
	path := writeYAML(t, content)
	cfg, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile() error: %v", err)
	}

	// api must appear exactly once in Groups["app"]
	count := 0
	for _, m := range cfg.Groups["app"] {
		if m == "api" {
			count++
		}
	}
	if count != 1 {
		t.Errorf("Groups['app'] has %d occurrences of 'api', want 1: %v", count, cfg.Groups["app"])
	}
}

func TestLoadYAMLCustomSettings(t *testing.T) {
	content := `
name: test

settings:
  logs_dir: /tmp/logs
  pid_dir: /tmp/pids
  start_timeout_ms: 60000
  health_check_interval_ms: 500

services:
  api:
    command: pnpm dev
    port: 3000
`
	path := writeYAML(t, content)
	cfg, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile() error: %v", err)
	}

	if cfg.Settings.LogsDir != "/tmp/logs" {
		t.Errorf("LogsDir = %q, want /tmp/logs", cfg.Settings.LogsDir)
	}
	if cfg.Settings.StartTimeout != 60000 {
		t.Errorf("StartTimeout = %d, want 60000", cfg.Settings.StartTimeout)
	}
	if cfg.Settings.HealthCheckInterval != 500 {
		t.Errorf("HealthCheckInterval = %d, want 500", cfg.Settings.HealthCheckInterval)
	}
}

func TestLoadYAMLMissingCommand(t *testing.T) {
	content := `
name: test
services:
  api:
    port: 3000
`
	path := writeYAML(t, content)
	_, err := LoadFile(path)
	if err == nil {
		t.Fatal("expected error for missing command, got nil")
	}
}

func TestLoadYAMLDetectsCycle(t *testing.T) {
	content := `
name: test
services:
  a:
    command: echo a
    depends_on: [b]
  b:
    command: echo b
    depends_on: [a]
`
	path := writeYAML(t, content)
	_, err := LoadFile(path)
	if err == nil {
		t.Fatal("expected cycle error, got nil")
	}
}

func TestLoadYAMLDetectsDanglingDep(t *testing.T) {
	content := `
name: test
services:
  a:
    command: echo a
    depends_on: [nonexistent]
`
	path := writeYAML(t, content)
	_, err := LoadFile(path)
	if err == nil {
		t.Fatal("expected dangling dep error, got nil")
	}
}

func TestLoadYAMLDetectsDuplicatePort(t *testing.T) {
	content := `
name: test
services:
  a:
    command: echo a
    port: 3000
  b:
    command: echo b
    port: 3000
`
	path := writeYAML(t, content)
	_, err := LoadFile(path)
	if err == nil {
		t.Fatal("expected duplicate port error, got nil")
	}
}

func TestLoadYAMLTopoSort(t *testing.T) {
	content := `
name: test
services:
  a:
    command: echo a
    port: 3001
  b:
    command: echo b
    port: 3002
    depends_on: [a]
  c:
    command: echo c
    port: 3003
    depends_on: [b]
`
	path := writeYAML(t, content)
	cfg, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile() error: %v", err)
	}

	layers, err := cfg.TopoSort()
	if err != nil {
		t.Fatalf("TopoSort() error: %v", err)
	}

	if len(layers) != 3 {
		t.Fatalf("got %d layers, want 3: %v", len(layers), layers)
	}
	if layers[0][0] != "a" {
		t.Errorf("layer 0 = %v, want [a]", layers[0])
	}
	if layers[1][0] != "b" {
		t.Errorf("layer 1 = %v, want [b]", layers[1])
	}
	if layers[2][0] != "c" {
		t.Errorf("layer 2 = %v, want [c]", layers[2])
	}
}

func TestLoadYMLExtension(t *testing.T) {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "devservices.yml")
	content := `
name: test
services:
  api:
    command: pnpm dev
    port: 3000
`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile(.yml) error: %v", err)
	}
	if _, ok := cfg.Services["api"]; !ok {
		t.Error("expected service 'api' to be present")
	}
}

func TestLoadUnsupportedExtension(t *testing.T) {
	unsupported := []string{"config.toml", "config.json"}
	for _, name := range unsupported {
		t.Run(name, func(t *testing.T) {
			dir := t.TempDir()
			path := filepath.Join(dir, name)
			if err := os.WriteFile(path, []byte("{}"), 0o600); err != nil {
				t.Fatal(err)
			}
			_, err := LoadFile(path)
			if err == nil {
				t.Fatalf("expected error for %q, got nil", name)
			}
		})
	}
}
