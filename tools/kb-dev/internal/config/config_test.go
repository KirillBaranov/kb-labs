package config

import (
	"os"
	"path/filepath"
	"testing"
)

func writeTestConfig(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "devservices.yaml")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

const minimalConfig = `
name: test
groups:
  infra: [a, b]
  app:   [c]
services:
  a:
    name: A
    type: node
    command: echo a
    port: 3000
  b:
    name: B
    type: docker
    command: echo b
    port: 3001
    depends_on: [a]
  c:
    name: C
    type: node
    command: echo c
    port: 3002
    depends_on: [b]
`

func TestLoadMinimal(t *testing.T) {
	path := writeTestConfig(t, minimalConfig)
	cfg, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile() error: %v", err)
	}

	if len(cfg.Services) != 3 {
		t.Errorf("got %d services, want 3", len(cfg.Services))
	}
	if len(cfg.Groups) != 2 {
		t.Errorf("got %d groups, want 2", len(cfg.Groups))
	}
}

func TestLoadAppliesDefaults(t *testing.T) {
	path := writeTestConfig(t, minimalConfig)
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
	if cfg.Services["a"].Target != "local" {
		t.Errorf("Target = %q, want local", cfg.Services["a"].Target)
	}
}

func TestLoadDetectsCycle(t *testing.T) {
	config := `
name: test
services:
  a:
    command: echo a
    depends_on: [b]
  b:
    command: echo b
    depends_on: [a]
`
	path := writeTestConfig(t, config)
	_, err := LoadFile(path)
	if err == nil {
		t.Fatal("expected cycle error, got nil")
	}
}

func TestLoadDetectsDanglingDep(t *testing.T) {
	config := `
name: test
services:
  a:
    command: echo a
    depends_on: [nonexistent]
`
	path := writeTestConfig(t, config)
	_, err := LoadFile(path)
	if err == nil {
		t.Fatal("expected dangling dep error, got nil")
	}
}

func TestLoadDetectsDuplicatePort(t *testing.T) {
	config := `
name: test
services:
  a:
    command: echo a
    port: 3000
  b:
    command: echo b
    port: 3000
`
	path := writeTestConfig(t, config)
	_, err := LoadFile(path)
	if err == nil {
		t.Fatal("expected duplicate port error, got nil")
	}
}

func TestResolveTarget(t *testing.T) {
	path := writeTestConfig(t, minimalConfig)
	cfg, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile() error: %v", err)
	}

	// All.
	all, err := cfg.ResolveTarget("")
	if err != nil {
		t.Fatalf("ResolveTarget('') error: %v", err)
	}
	if len(all) != 3 {
		t.Errorf("ResolveTarget('') = %d services, want 3", len(all))
	}

	// Group.
	infra, err := cfg.ResolveTarget("infra")
	if err != nil {
		t.Fatalf("ResolveTarget('infra') error: %v", err)
	}
	if len(infra) != 2 {
		t.Errorf("ResolveTarget('infra') = %d services, want 2", len(infra))
	}

	// Single service.
	single, err := cfg.ResolveTarget("a")
	if err != nil {
		t.Fatalf("ResolveTarget('a') error: %v", err)
	}
	if len(single) != 1 || single[0] != "a" {
		t.Errorf("ResolveTarget('a') = %v, want [a]", single)
	}

	// Unknown.
	_, err = cfg.ResolveTarget("nope")
	if err == nil {
		t.Fatal("expected error for unknown target")
	}
}

func TestTopoSort(t *testing.T) {
	path := writeTestConfig(t, minimalConfig)
	cfg, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile() error: %v", err)
	}

	layers, err := cfg.TopoSort()
	if err != nil {
		t.Fatalf("TopoSort() error: %v", err)
	}

	// a has no deps → layer 0
	// b depends on a → layer 1
	// c depends on b → layer 2
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

func TestDependents(t *testing.T) {
	path := writeTestConfig(t, minimalConfig)
	cfg, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile() error: %v", err)
	}

	deps := cfg.Dependents("a")
	// b depends on a, c depends on b → both are dependents of a.
	if len(deps) != 2 {
		t.Errorf("Dependents(a) = %v (len %d), want 2", deps, len(deps))
	}

	deps = cfg.Dependents("c")
	if len(deps) != 0 {
		t.Errorf("Dependents(c) = %v, want empty", deps)
	}
}

func TestGroupOrder(t *testing.T) {
	path := writeTestConfig(t, minimalConfig)
	cfg, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile() error: %v", err)
	}

	order := cfg.GroupOrder()
	if len(order) != 2 {
		t.Errorf("GroupOrder() = %v (len %d), want 2", order, len(order))
	}
	// "infra" is conventional, "app" is not → infra first.
	if order[0] != "infra" {
		t.Errorf("first group = %q, want infra", order[0])
	}
}
