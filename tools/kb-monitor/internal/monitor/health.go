// Package monitor implements remote observability operations over SSH.
package monitor

import (
	"fmt"
	"strings"

	"github.com/kb-labs/kb-monitor/internal/ssh"
)

// CheckHealth returns the health status of a compose service.
// Possible values: healthy / unhealthy / starting / running / stopped / unknown.
func CheckHealth(client *ssh.Client, composeFile, service string) (string, error) {
	id, err := resolveContainer(client, composeFile, service)
	if err != nil {
		return "stopped", nil //nolint:nilerr // container not running is a valid state
	}

	out, err := client.Run(fmt.Sprintf(
		"docker inspect %s --format '{{.State.Health.Status}}'", id,
	))
	status := strings.TrimSpace(strings.Trim(out, "'"))

	if err != nil || status == "" {
		// No healthcheck configured — fall back to running state.
		out2, err2 := client.Run(fmt.Sprintf(
			"docker inspect %s --format '{{.State.Running}}'", id,
		))
		if err2 != nil {
			return "unknown", err2
		}
		if strings.TrimSpace(strings.Trim(out2, "'")) == "true" {
			return "running", nil
		}
		return "stopped", nil
	}

	switch status {
	case "healthy", "unhealthy", "starting":
		return status, nil
	default:
		return "unknown", nil
	}
}

// resolveContainer returns the container ID for a compose service.
func resolveContainer(client *ssh.Client, composeFile, service string) (string, error) {
	out, err := client.Run(fmt.Sprintf(
		"docker compose -f %s ps -q %s", composeFile, service,
	))
	id := strings.TrimSpace(out)
	if err != nil || id == "" {
		return "", fmt.Errorf("container for service %q not found (not running?)", service)
	}
	return id, nil
}
