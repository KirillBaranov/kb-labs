package orchestrator

import "testing"

// TestComputePortsAdditive mirrors the platform/kb-dev additive offset
// (canonical + offset). If canonical ports change, keep this in sync.
func TestComputePortsAdditive(t *testing.T) {
	got := ComputePorts(1000)
	want := map[string]int{
		"studio":  4000, // 3000 + 1000
		"gateway": 5000, // 4000 + 1000
		"rest":    6050, // 5050 + 1000
		"state":   8777, // 7777 + 1000
	}
	for id, w := range want {
		if got[id] != w {
			t.Errorf("ComputePorts[%s] = %d, want %d", id, got[id], w)
		}
	}
	// offset 0 → canonical defaults.
	if ComputePorts(0)["gateway"] != 4000 {
		t.Errorf("offset 0 should give canonical gateway 4000")
	}
}
