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

// FetchStatus returns the current state of a compose service.
func FetchStatus(client *ssh.Client, composeFile, service string) (StatusResult, error) {
	res := StatusResult{Service: service}

	id, err := resolveContainer(client, composeFile, service)
	if err != nil {
		// Container not running — return stopped state, not an error.
		res.Running = false
		res.Health = "stopped"
		return res, nil
	}

	out, err := client.Run(fmt.Sprintf(
		"docker inspect %s --format '{{.State.Running}}|{{.State.Health.Status}}|{{.State.StartedAt}}|{{.Image}}'",
		id,
	))
	if err != nil {
		return res, fmt.Errorf("docker inspect: %w", err)
	}

	parts := strings.SplitN(strings.TrimSpace(strings.Trim(out, "'")), "|", 4)
	if len(parts) < 4 {
		return res, fmt.Errorf("unexpected inspect output: %q", out)
	}

	res.Running = strings.TrimSpace(parts[0]) == "true"
	res.Health = healthLabel(strings.TrimSpace(parts[1]), res.Running)
	res.StartedAt = strings.TrimSpace(parts[2])
	res.ImageSHA = strings.TrimSpace(parts[3])

	return res, nil
}

// healthLabel normalises the docker health status string.
func healthLabel(raw string, running bool) string {
	switch raw {
	case "healthy", "unhealthy", "starting":
		return raw
	case "":
		if running {
			return "running"
		}
		return "stopped"
	default:
		return "unknown"
	}
}
