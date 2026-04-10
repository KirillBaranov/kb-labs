package monitor

import (
	"context"
	"fmt"
	"io"

	"github.com/kb-labs/kb-monitor/internal/ssh"
)

// FetchLogs returns the last n lines of logs for a compose service.
func FetchLogs(client *ssh.Client, composeFile, service string, lines int) (string, error) {
	cmd := fmt.Sprintf(
		"docker compose -f %s logs --tail %d --no-color %s 2>&1",
		composeFile, lines, service,
	)
	out, err := client.Run(cmd)
	if err != nil {
		return "", fmt.Errorf("fetch logs: %w", err)
	}
	return out, nil
}

// StreamLogs streams live logs for a compose service to w until ctx is cancelled.
func StreamLogs(ctx context.Context, client *ssh.Client, composeFile, service string, w io.Writer) error {
	cmd := fmt.Sprintf(
		"docker compose -f %s logs --follow --no-color %s 2>&1",
		composeFile, service,
	)
	return client.Stream(ctx, cmd, w)
}
