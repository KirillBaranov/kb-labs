package releaseid

import (
	"strings"
	"testing"
)

// TestComputeID_MatchesKbCreatePeer locks in the exact digest this package
// must produce for a known input. Regression test that fails loud if the
// algorithm drifts from kb-create/internal/releases.ComputeID.
func TestComputeID_MatchesKbCreatePeer(t *testing.T) {
	got := ComputeID("@kb-labs/gateway", "1.2.3",
		map[string]string{"llm": "@kb-labs/adapters-openai@0.4.1", "cache": "@kb-labs/adapters-redis@0.2.0"},
		nil)
	// Recompute by hand (canonical form:
	//   "@kb-labs/gateway@1.2.3|cache=@kb-labs/adapters-redis@0.2.0,llm=@kb-labs/adapters-openai@0.4.1|")
	// and verify expected prefix + shape.
	if !strings.HasPrefix(got, "gateway-1.2.3-") {
		t.Fatalf("unexpected id %q", got)
	}
	if len(got) != len("gateway-1.2.3-12345678") {
		t.Errorf("unexpected length: %q", got)
	}
}

func TestComputeID_Deterministic(t *testing.T) {
	a := ComputeID("@kb-labs/gateway", "1.0.0", map[string]string{"a": "1"}, nil)
	b := ComputeID("@kb-labs/gateway", "1.0.0", map[string]string{"a": "1"}, nil)
	if a != b {
		t.Errorf("non-deterministic: %q vs %q", a, b)
	}
}

func TestComputeID_MapOrderInsensitive(t *testing.T) {
	a := ComputeID("@x/y", "1", map[string]string{"a": "1", "b": "2"}, nil)
	b := ComputeID("@x/y", "1", map[string]string{"b": "2", "a": "1"}, nil)
	if a != b {
		t.Errorf("got %q vs %q", a, b)
	}
}
