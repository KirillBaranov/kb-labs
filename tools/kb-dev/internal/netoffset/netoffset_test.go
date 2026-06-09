package netoffset

import "testing"

func TestShift(t *testing.T) {
	cases := []struct {
		in     string
		offset int
		want   string
	}{
		{"http://localhost:7777/health", 1000, "http://localhost:8777/health"},
		{"http://127.0.0.1:5050/api/v1/health", 1000, "http://127.0.0.1:6050/api/v1/health"},
		{"localhost:6379", 1000, "localhost:7379"},
		{"http://localhost:4000", 1000, "http://localhost:5000"},
		{"/health", 1000, "/health"},                          // socket-style, no port
		{"http://localhost:7777", 0, "http://localhost:7777"}, // offset 0 → unchanged
	}
	for _, c := range cases {
		if got := Shift(c.in, c.offset); got != c.want {
			t.Errorf("Shift(%q,%d) = %q, want %q", c.in, c.offset, got, c.want)
		}
	}
}
