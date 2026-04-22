package manager

import (
	"testing"
	"time"

	"github.com/kb-labs/dev/internal/config"
)

func testServices() map[string]config.Service {
	return map[string]config.Service{
		"redis": {Name: "Redis", Type: config.ServiceTypeDocker, Port: 6379},
		"state-daemon": {
			Name: "State Daemon", Type: config.ServiceTypeNode, Port: 7777,
			DependsOn: []string{"redis"},
		},
		"workflow": {
			Name: "Workflow", Type: config.ServiceTypeNode, Port: 7778,
			DependsOn: []string{"state-daemon"},
		},
		"rest": {
			Name: "REST API", Type: config.ServiceTypeNode, Port: 5050,
			DependsOn: []string{"workflow"},
		},
		"gateway": {
			Name: "Gateway", Type: config.ServiceTypeNode, Port: 4000,
			DependsOn: []string{"state-daemon"},
		},
		"studio": {
			Name: "Studio", Type: config.ServiceTypeNode, Port: 3000,
			DependsOn: []string{"rest"},
		},
	}
}

func TestTopoLayers(t *testing.T) {
	layers, err := TopoLayers(testServices())
	if err != nil {
		t.Fatalf("TopoLayers() error: %v", err)
	}

	// Layer 0: redis (no deps)
	// Layer 1: state-daemon (depends on redis)
	// Layer 2: workflow, gateway (depend on state-daemon)
	// Layer 3: rest (depends on workflow)
	// Layer 4: studio (depends on rest)
	if len(layers) != 5 {
		t.Fatalf("got %d layers, want 5: %v", len(layers), layers)
	}

	if layers[0][0] != "redis" {
		t.Errorf("layer 0 = %v, want [redis]", layers[0])
	}
	if layers[1][0] != "state-daemon" {
		t.Errorf("layer 1 = %v, want [state-daemon]", layers[1])
	}
	// Layer 2 should have gateway and workflow (parallel).
	if len(layers[2]) != 2 {
		t.Errorf("layer 2 = %v, want 2 services", layers[2])
	}
}

func TestDepsOf(t *testing.T) {
	svcs := testServices()

	// rest depends on workflow → state-daemon → redis.
	deps := DepsOf([]string{"rest"}, svcs)
	if len(deps) != 4 {
		t.Errorf("DepsOf(rest) = %v (len %d), want 4 (rest + workflow + state-daemon + redis)", deps, len(deps))
	}

	// redis has no deps.
	deps = DepsOf([]string{"redis"}, svcs)
	if len(deps) != 1 {
		t.Errorf("DepsOf(redis) = %v, want [redis]", deps)
	}

	// Multiple targets.
	deps = DepsOf([]string{"rest", "gateway"}, svcs)
	// rest chain + gateway chain, deduplicated.
	if len(deps) != 5 {
		t.Errorf("DepsOf(rest, gateway) = %v (len %d), want 5", deps, len(deps))
	}
}

func TestBackoffDuration(t *testing.T) {
	tests := []struct {
		attempt int
		want    string
	}{
		{1, "1s"},
		{2, "2s"},
		{3, "4s"},
		{4, "8s"},
		{5, "16s"},
		{6, "30s"}, // capped at maxBackoff
		{10, "30s"},
	}
	for _, tt := range tests {
		got := backoffDuration(tt.attempt)
		if got.String() != tt.want {
			t.Errorf("backoffDuration(%d) = %s, want %s", tt.attempt, got, tt.want)
		}
	}
}

func TestContains(t *testing.T) {
	slice := []string{"a", "b", "c"}
	if !contains(slice, "b") {
		t.Error("should contain b")
	}
	if contains(slice, "d") {
		t.Error("should not contain d")
	}
}

// ── New ────────────────────────────────────────────────────────────────

func TestNew_CreatesServicesFromConfig(t *testing.T) {
	cfg := &config.Config{
		Services: testServices(),
		Settings: config.Settings{StartTimeout: 5000},
	}
	m := New(cfg, "/workspace", "/workspace")

	if len(m.services) != len(cfg.Services) {
		t.Errorf("services = %d, want %d", len(m.services), len(cfg.Services))
	}
	if m.rootDir != "/workspace" {
		t.Errorf("rootDir = %q, want /workspace", m.rootDir)
	}
	// Each service should have a lock
	if len(m.svcLocks) != len(cfg.Services) {
		t.Errorf("svcLocks = %d, want %d", len(m.svcLocks), len(cfg.Services))
	}
}

func TestNew_EmptyConfig(t *testing.T) {
	cfg := &config.Config{
		Services: map[string]config.Service{},
		Settings: config.Settings{},
	}
	m := New(cfg, "/tmp", "/tmp")

	if len(m.services) != 0 {
		t.Errorf("services = %d, want 0", len(m.services))
	}
}

// ── spawnEnv ───────────────────────────────────────────────────────────

func TestSpawnEnv_MergesServiceEnv(t *testing.T) {
	cfg := &config.Config{
		Services: map[string]config.Service{},
		Settings: config.Settings{},
	}
	m := New(cfg, "/workspace", "/workspace")

	svcEnv := map[string]string{
		"NODE_ENV": "production",
		"PORT":     "3000",
	}
	result := m.spawnEnv(svcEnv)

	if result["NODE_ENV"] != "production" {
		t.Errorf("NODE_ENV = %q, want production", result["NODE_ENV"])
	}
	if result["PORT"] != "3000" {
		t.Errorf("PORT = %q, want 3000", result["PORT"])
	}
	if result["KB_PROJECT_ROOT"] != "/workspace" {
		t.Errorf("KB_PROJECT_ROOT = %q, want /workspace", result["KB_PROJECT_ROOT"])
	}
}

func TestSpawnEnv_DoesNotOverrideExistingKBProjectRoot(t *testing.T) {
	cfg := &config.Config{
		Services: map[string]config.Service{},
		Settings: config.Settings{},
	}
	m := New(cfg, "/workspace", "/workspace")

	svcEnv := map[string]string{
		"KB_PROJECT_ROOT": "/custom/root",
	}
	result := m.spawnEnv(svcEnv)

	if result["KB_PROJECT_ROOT"] != "/custom/root" {
		t.Errorf("KB_PROJECT_ROOT = %q, want /custom/root (should not override)", result["KB_PROJECT_ROOT"])
	}
}

func TestSpawnEnv_EmptyServiceEnv(t *testing.T) {
	cfg := &config.Config{
		Services: map[string]config.Service{},
		Settings: config.Settings{},
	}
	m := New(cfg, "/workspace", "/workspace")

	result := m.spawnEnv(map[string]string{})

	if result["KB_PROJECT_ROOT"] != "/workspace" {
		t.Errorf("KB_PROJECT_ROOT = %q, want /workspace", result["KB_PROJECT_ROOT"])
	}
	if len(result) != 1 {
		t.Errorf("len = %d, want 1 (only KB_PROJECT_ROOT)", len(result))
	}
}

// ── startTimeout ───────────────────────────────────────────────────────

func TestStartTimeout_DefaultFromConfig(t *testing.T) {
	cfg := &config.Config{
		Services: map[string]config.Service{},
		Settings: config.Settings{StartTimeout: 30000},
	}
	m := New(cfg, "/workspace", "/workspace")

	got := m.startTimeout()
	want := 30 * time.Second
	if got != want {
		t.Errorf("startTimeout() = %v, want %v", got, want)
	}
}

func TestStartTimeout_ZeroConfig(t *testing.T) {
	cfg := &config.Config{
		Services: map[string]config.Service{},
		Settings: config.Settings{StartTimeout: 0},
	}
	m := New(cfg, "/workspace", "/workspace")

	got := m.startTimeout()
	if got != 0 {
		t.Errorf("startTimeout() = %v, want 0", got)
	}
}

// ── Accessors ──────────────────────────────────────────────────────────

func TestAccessors(t *testing.T) {
	cfg := &config.Config{
		Services: testServices(),
		Settings: config.Settings{StartTimeout: 5000},
	}
	m := New(cfg, "/workspace", "/workspace")

	if m.Config() != cfg {
		t.Error("Config() should return the original config")
	}
	if m.RootDir() != "/workspace" {
		t.Errorf("RootDir() = %q, want /workspace", m.RootDir())
	}
}

func TestGetService_Found(t *testing.T) {
	cfg := &config.Config{
		Services: testServices(),
		Settings: config.Settings{},
	}
	m := New(cfg, "/workspace", "/workspace")

	svc := m.GetService("redis")
	if svc == nil {
		t.Fatal("GetService(redis) = nil, want non-nil")
	}
}

func TestGetService_NotFound(t *testing.T) {
	cfg := &config.Config{
		Services: testServices(),
		Settings: config.Settings{},
	}
	m := New(cfg, "/workspace", "/workspace")

	svc := m.GetService("nonexistent")
	if svc != nil {
		t.Error("GetService(nonexistent) should return nil")
	}
}

// ── TopoLayers edge cases ──────────────────────────────────────────────

func TestTopoLayers_SingleService(t *testing.T) {
	svcs := map[string]config.Service{
		"api": {Name: "API", Type: config.ServiceTypeNode, Port: 3000},
	}
	layers, err := TopoLayers(svcs)
	if err != nil {
		t.Fatalf("TopoLayers() error: %v", err)
	}
	if len(layers) != 1 {
		t.Fatalf("got %d layers, want 1", len(layers))
	}
	if layers[0][0] != "api" {
		t.Errorf("layer 0 = %v, want [api]", layers[0])
	}
}

func TestTopoLayers_NoDeps_AllParallel(t *testing.T) {
	svcs := map[string]config.Service{
		"a": {Name: "A", Type: config.ServiceTypeNode},
		"b": {Name: "B", Type: config.ServiceTypeNode},
		"c": {Name: "C", Type: config.ServiceTypeNode},
	}
	layers, err := TopoLayers(svcs)
	if err != nil {
		t.Fatalf("TopoLayers() error: %v", err)
	}
	if len(layers) != 1 {
		t.Fatalf("got %d layers, want 1 (all independent)", len(layers))
	}
	if len(layers[0]) != 3 {
		t.Errorf("layer 0 has %d services, want 3", len(layers[0]))
	}
}
