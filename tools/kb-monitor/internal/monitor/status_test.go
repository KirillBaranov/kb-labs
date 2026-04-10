package monitor

import "testing"

func TestHealthLabel(t *testing.T) {
	cases := []struct {
		raw     string
		running bool
		want    string
	}{
		{"healthy", true, "healthy"},
		{"unhealthy", true, "unhealthy"},
		{"starting", true, "starting"},
		{"", true, "running"},
		{"", false, "stopped"},
		{"weird", true, "unknown"},
		{"weird", false, "unknown"},
	}

	for _, c := range cases {
		got := healthLabel(c.raw, c.running)
		if got != c.want {
			t.Errorf("healthLabel(%q, %v) = %q, want %q", c.raw, c.running, got, c.want)
		}
	}
}
