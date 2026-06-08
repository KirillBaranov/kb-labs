package orchestrator

import "testing"

// TestComputePortsMirrorsKBDev locks the offsets to kb-dev's ApplyPortBase
// (offset = base - minTCP(3000)). If kb-dev's canonical ports change, this and
// config.ApplyPortBase must change together.
func TestComputePortsMirrorsKBDev(t *testing.T) {
	got := ComputePorts(14000)
	want := map[string]int{
		"studio":  14000, // 3000 + 11000
		"gateway": 15000, // 4000 + 11000
		"rest":    16050, // 5050 + 11000
		"state":   18777, // 7777 + 11000
	}
	for id, w := range want {
		if got[id] != w {
			t.Errorf("ComputePorts[%s] = %d, want %d", id, got[id], w)
		}
	}
}
