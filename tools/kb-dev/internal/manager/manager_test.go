package manager

import (
	"testing"

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
