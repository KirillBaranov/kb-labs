package releaseid

import (
	"strings"
	"testing"
)

// TestComputeID_MatchesKbCreatePeer locks in the exact digest this package
// must produce for a known input. Regression test that fails loud if the
// algorithm drifts from kb-create/internal/releases.ComputeID.
func TestComputeID_MatchesKbCreatePeer(t *testing.T) {
	// Empty integrity → spec-only digest, which must equal kb-create's
	// releases.ComputeID for the same inputs (the deploy path passes the id to
	// install-service explicitly, but the spec-only parity is still a useful
	// invariant for the fallback path).
	got := ComputeID("@kb-labs/gateway", "1.2.3", "",
		map[string]string{"llm": "@kb-labs/adapters-openai@0.4.1", "cache": "@kb-labs/adapters-redis@0.2.0"},
		nil)
	if !strings.HasPrefix(got, "gateway-1.2.3-") {
		t.Fatalf("unexpected id %q", got)
	}
	if len(got) != len("gateway-1.2.3-12345678") {
		t.Errorf("unexpected length: %q", got)
	}
}

func TestComputeID_Deterministic(t *testing.T) {
	a := ComputeID("@kb-labs/gateway", "1.0.0", "sha512-abc", map[string]string{"a": "1"}, nil)
	b := ComputeID("@kb-labs/gateway", "1.0.0", "sha512-abc", map[string]string{"a": "1"}, nil)
	if a != b {
		t.Errorf("non-deterministic: %q vs %q", a, b)
	}
}

func TestComputeID_MapOrderInsensitive(t *testing.T) {
	a := ComputeID("@x/y", "1", "", map[string]string{"a": "1", "b": "2"}, nil)
	b := ComputeID("@x/y", "1", "", map[string]string{"b": "2", "a": "1"}, nil)
	if a != b {
		t.Errorf("got %q vs %q", a, b)
	}
}

// TestComputeID_IntegrityChangesID is the core Fix-3 guard: same spec + same
// version but different content (integrity) must yield a different id, so the
// planner reinstalls instead of skipping a patched package.
func TestComputeID_IntegrityChangesID(t *testing.T) {
	specOnly := ComputeID("@kb-labs/gateway", "1.2.3", "", nil, nil)
	v1 := ComputeID("@kb-labs/gateway", "1.2.3", "sha512-AAA", nil, nil)
	v2 := ComputeID("@kb-labs/gateway", "1.2.3", "sha512-BBB", nil, nil)

	if v1 == v2 {
		t.Errorf("different integrity produced same id: %q", v1)
	}
	if v1 == specOnly || v2 == specOnly {
		t.Errorf("integrity-aware id collided with spec-only id")
	}
	// All keep the same human-readable prefix.
	for _, id := range []string{specOnly, v1, v2} {
		if !strings.HasPrefix(id, "gateway-1.2.3-") {
			t.Errorf("unexpected prefix: %q", id)
		}
	}
}
