package logs

import (
	"os"
	"strings"
	"testing"
)

func TestTranscriptIsPrivateAndRedactsSecrets(t *testing.T) {
	log, err := New(t.TempDir(), "c1", []string{"token-value"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := log.Write([]byte("token=token-value\n")); err != nil {
		t.Fatal(err)
	}
	if err := log.Close(); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(log.Path())
	if err != nil || strings.Contains(string(data), "token-value") || !strings.Contains(string(data), "[REDACTED]") {
		t.Fatalf("log = %q, error = %v", data, err)
	}
	info, err := os.Stat(log.Path())
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("permissions = %v, error = %v", info.Mode(), err)
	}
}
