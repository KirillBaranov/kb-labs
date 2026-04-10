package monitor

import (
	"fmt"

	"github.com/kb-labs/kb-monitor/internal/ssh"
)

// ExecContainer runs cmd inside the compose service container.
// Uses docker compose exec -T to avoid TTY allocation over SSH.
func ExecContainer(client *ssh.Client, composeFile, service, cmd string) (string, error) {
	remote := fmt.Sprintf(
		"docker compose -f %s exec -T %s sh -c %q",
		composeFile, service, cmd,
	)
	out, err := client.Run(remote)
	if err != nil {
		return out, fmt.Errorf("exec: %w", err)
	}
	return out, nil
}
