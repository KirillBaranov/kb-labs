// Package monitor implements remote observability operations over SSH.
package monitor

import (
	"fmt"
	"strings"

	"github.com/kb-labs/kb-monitor/internal/ssh"
)

const sep = "---SEP---"

// CheckHealthAll checks health for multiple containers in a single SSH session.
// Returns one status per container in the same order: running / stopped / unknown.
func CheckHealthAll(client *ssh.Client, containers []string) ([]string, error) {
	if len(containers) == 0 {
		return nil, nil
	}

	// Build one shell script: cmd ; echo SEP ; cmd ; echo SEP ; ...
	parts := make([]string, 0, len(containers)*2)
	for _, c := range containers {
		parts = append(parts,
			fmt.Sprintf("docker inspect %s --format {{.State.Running}} 2>/dev/null || echo false", c),
			"echo "+sep,
		)
	}
	script := strings.Join(parts, "; ")

	out, err := client.Run(script)
	// Parse regardless of error — partial output is still useful.
	return parseHealthOutput(out, len(containers)), err
}

// parseHealthOutput parses the SEP-delimited output of CheckHealthAll.
func parseHealthOutput(out string, n int) []string {
	segments := strings.Split(out, sep+"\n")
	results := make([]string, n)
	for i := range results {
		if i >= len(segments) {
			results[i] = "unknown"
			continue
		}
		switch strings.TrimSpace(segments[i]) {
		case "true":
			results[i] = "running"
		case "false":
			results[i] = "stopped"
		default:
			results[i] = "unknown"
		}
	}
	return results
}
