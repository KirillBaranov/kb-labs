package monitor

import (
	"fmt"
	"strings"

	"github.com/kb-labs/kb-monitor/internal/ssh"
)

// StatusResult holds the current state of a deployed service.
type StatusResult struct {
	Service   string `json:"service"`
	Running   bool   `json:"running"`
	Health    string `json:"health"`
	StartedAt string `json:"started_at"`
	ImageSHA  string `json:"image_sha"`
}

// FetchStatusAll fetches status for multiple containers in a single SSH session.
func FetchStatusAll(client *ssh.Client, containers []string) ([]StatusResult, error) {
	if len(containers) == 0 {
		return nil, nil
	}

	// Build one shell script: cmd ; echo SEP ; cmd ; echo SEP ; ...
	parts := make([]string, 0, len(containers)*2)
	for _, c := range containers {
		parts = append(parts,
			fmt.Sprintf("docker inspect %s --format {{.State.Running}}@{{.State.StartedAt}}@{{.Image}} 2>/dev/null || echo false@@", c),
			"echo "+sep,
		)
	}
	script := strings.Join(parts, "; ")

	out, err := client.Run(script)

	segments := strings.Split(out, sep+"\n")
	results := make([]StatusResult, len(containers))
	for i, c := range containers {
		results[i] = StatusResult{Service: c}
		if i >= len(segments) {
			results[i].Health = "unknown"
			continue
		}
		line := strings.TrimSpace(segments[i])
		fields := strings.SplitN(line, "@", 3)
		if len(fields) < 3 {
			results[i].Health = "unknown"
			continue
		}
		results[i].Running = strings.TrimSpace(fields[0]) == "true"
		if results[i].Running {
			results[i].Health = "running"
		} else {
			results[i].Health = "stopped"
		}
		results[i].StartedAt = strings.TrimSpace(fields[1])
		results[i].ImageSHA = strings.TrimSpace(fields[2])
	}
	return results, err
}
