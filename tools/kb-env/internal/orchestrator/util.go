package orchestrator

import (
	"encoding/json"
	"os"
	"strings"
)

func jsonUnmarshal(data []byte, v any) error { return json.Unmarshal(data, v) }

// copyFile copies src to dst (0600), creating/truncating dst.
func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0o600)
}

func splitLines(s string) []string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	return strings.Split(strings.TrimRight(s, "\n"), "\n")
}

func joinLines(lines []string) string { return strings.Join(lines, "\n") }
