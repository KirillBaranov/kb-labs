package releases

import (
	"strings"
	"testing"
)

func TestComputeID_Format(t *testing.T) {
	id := ComputeID("@kb-labs/gateway", "1.2.3", map[string]string{"llm": "a@1"}, nil)
	parts := strings.Split(id, "-")
	if len(parts) < 3 {
		t.Fatalf("expected at least 3 segments, got %q", id)
	}
	if !strings.HasPrefix(id, "gateway-1.2.3-") {
		t.Errorf("expected prefix 'gateway-1.2.3-', got %q", id)
	}
	hash := parts[len(parts)-1]
	if len(hash) != 8 {
		t.Errorf("expected 8-char hash suffix, got %q (len %d)", hash, len(hash))
	}
}

func TestComputeID_Deterministic(t *testing.T) {
	adapters := map[string]string{"llm": "a@1", "cache": "b@2"}
	a := ComputeID("@kb-labs/gateway", "1.0.0", adapters, nil)
	b := ComputeID("@kb-labs/gateway", "1.0.0", adapters, nil)
	if a != b {
		t.Errorf("non-deterministic: %q vs %q", a, b)
	}
}

func TestComputeID_MapOrderInsensitive(t *testing.T) {
	a := ComputeID("@kb-labs/gateway", "1.0.0",
		map[string]string{"llm": "openai@0.4", "cache": "redis@0.2"}, nil)
	b := ComputeID("@kb-labs/gateway", "1.0.0",
		map[string]string{"cache": "redis@0.2", "llm": "openai@0.4"}, nil)
	if a != b {
		t.Errorf("map iteration order leaked: %q vs %q", a, b)
	}
}

func TestComputeID_ChangesOnInputChange(t *testing.T) {
	base := ComputeID("@kb-labs/gateway", "1.0.0", map[string]string{"llm": "a@1"}, nil)

	diffVersion := ComputeID("@kb-labs/gateway", "1.0.1", map[string]string{"llm": "a@1"}, nil)
	if base == diffVersion {
		t.Error("id did not change when version changed")
	}

	diffAdapter := ComputeID("@kb-labs/gateway", "1.0.0", map[string]string{"llm": "a@2"}, nil)
	if base == diffAdapter {
		t.Error("id did not change when adapter spec changed")
	}

	diffPlugin := ComputeID("@kb-labs/gateway", "1.0.0",
		map[string]string{"llm": "a@1"}, map[string]string{"@kb-labs/marketplace": "1.0"})
	if base == diffPlugin {
		t.Error("id did not change when plugins added")
	}
}

func TestComputeID_ShortName(t *testing.T) {
	cases := []struct {
		pkg, want string
	}{
		{"@kb-labs/gateway", "gateway"},
		{"@kb-labs/rest-api", "rest-api"},
		{"gateway", "gateway"},
		{"@scope/multi/part", "multi/part"},
	}
	for _, c := range cases {
		if got := shortName(c.pkg); got != c.want {
			t.Errorf("shortName(%q) = %q, want %q", c.pkg, got, c.want)
		}
	}
}

func TestJoinSorted_Empty(t *testing.T) {
	if got := joinSorted(nil); got != "" {
		t.Errorf("joinSorted(nil) = %q, want empty", got)
	}
	if got := joinSorted(map[string]string{}); got != "" {
		t.Errorf("joinSorted(empty) = %q, want empty", got)
	}
}

func TestJoinSorted_Order(t *testing.T) {
	m := map[string]string{"b": "2", "a": "1", "c": "3"}
	got := joinSorted(m)
	want := "a=1,b=2,c=3"
	if got != want {
		t.Errorf("joinSorted = %q, want %q", got, want)
	}
}
