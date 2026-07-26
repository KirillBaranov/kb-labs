package cmd

import (
	"strings"
	"testing"
)

func TestRedactDiagnosticLines(t *testing.T) {
	lines := redactDiagnosticLines([]string{
		"Authorization: Bearer abc123",
		"password=secret token:abc https://user:pass@example.test",
	})
	joined := strings.Join(lines, "\n")
	for _, secret := range []string{"abc123", "secret", "token:abc", "user:pass"} {
		if strings.Contains(joined, secret) {
			t.Errorf("diagnostic output contains secret %q: %s", secret, joined)
		}
	}
	if strings.Count(joined, "[REDACTED]") != 4 {
		t.Fatalf("redacted %d values, want 4: %s", strings.Count(joined, "[REDACTED]"), joined)
	}
}
