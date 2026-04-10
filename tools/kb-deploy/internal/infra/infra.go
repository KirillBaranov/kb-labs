// Package infra manages stateful infrastructure services via docker run over SSH.
package infra

import (
	"fmt"
	"strings"

	"github.com/kb-labs/kb-deploy/internal/config"
	"github.com/kb-labs/kb-deploy/internal/ssh"
)

// Status describes the runtime state of an infra service.
type Status struct {
	Name    string `json:"name"`
	Image   string `json:"image"`
	Running bool   `json:"running"`
	State   string `json:"state"` // running / stopped / absent / unknown
}

// Up ensures the named service is running on the remote host.
// Idempotent: if the container is already running, does nothing.
// If stopped, starts it. If absent, creates and starts it.
func Up(client *ssh.Client, name string, svc config.InfraService) error {
	// Check current container state.
	state, err := containerState(client, name)
	if err != nil {
		return err
	}

	switch state {
	case "running":
		return nil // already up
	case "stopped":
		_, err := client.Run("docker start " + name)
		return err
	default:
		// absent — create and start
		return dockerRun(client, name, svc)
	}
}

// Down stops and removes the named container. Idempotent if already absent.
func Down(client *ssh.Client, name string) error {
	state, err := containerState(client, name)
	if err != nil {
		return err
	}
	if state == "absent" {
		return nil
	}
	script := fmt.Sprintf("docker stop %s 2>/dev/null; docker rm %s 2>/dev/null", name, name)
	_, err = client.Run(script)
	return err
}

// GetStatus returns the current runtime status of the named container.
func GetStatus(client *ssh.Client, name, image string) Status {
	s := Status{Name: name, Image: image}
	state, err := containerState(client, name)
	if err != nil {
		s.State = "unknown"
		return s
	}
	s.State = state
	s.Running = state == "running"
	return s
}

// GetStatusAll returns statuses for all infra services in one SSH session per host.
// names and svcs must be parallel slices.
func GetStatusAll(client *ssh.Client, names []string, svcs []config.InfraService) []Status {
	if len(names) == 0 {
		return nil
	}

	const sep = "---SEP---"
	parts := make([]string, 0, len(names)*2)
	for _, n := range names {
		parts = append(parts,
			fmt.Sprintf("docker inspect %s --format {{.State.Running}} 2>/dev/null || echo absent", n),
			"echo "+sep,
		)
	}
	out, _ := client.Run(strings.Join(parts, "; "))

	segments := strings.Split(out, sep+"\n")
	results := make([]Status, len(names))
	for i, n := range names {
		results[i] = Status{Name: n, Image: svcs[i].Image}
		if i >= len(segments) {
			results[i].State = "unknown"
			continue
		}
		switch strings.TrimSpace(segments[i]) {
		case "true":
			results[i].Running = true
			results[i].State = "running"
		case "false":
			results[i].State = "stopped"
		case "absent":
			results[i].State = "absent"
		default:
			results[i].State = "unknown"
		}
	}
	return results
}

// containerState returns "running", "stopped", or "absent".
func containerState(client *ssh.Client, name string) (string, error) {
	out, _ := client.Run(
		fmt.Sprintf("docker inspect %s --format {{.State.Running}} 2>/dev/null || echo absent", name),
	)
	switch strings.TrimSpace(out) {
	case "true":
		return "running", nil
	case "false":
		return "stopped", nil
	case "absent":
		return "absent", nil
	default:
		return "unknown", nil
	}
}

// dockerRun builds and executes a `docker run` command for an InfraService.
func dockerRun(client *ssh.Client, name string, svc config.InfraService) error {
	args := []string{"docker", "run", "-d", "--name", name}

	restart := svc.Restart
	if restart == "" {
		restart = "unless-stopped"
	}
	args = append(args, "--restart", restart)

	for _, v := range svc.Volumes {
		args = append(args, "-v", v)
	}
	for _, p := range svc.Ports {
		args = append(args, "-p", p)
	}
	for k, v := range svc.Env {
		args = append(args, "-e", shellQuote(k+"="+v))
	}

	args = append(args, svc.Image)

	cmd := strings.Join(args, " ")
	if _, err := client.Run("docker pull " + svc.Image); err != nil {
		return fmt.Errorf("pull %s: %w", svc.Image, err)
	}
	if _, err := client.Run(cmd); err != nil {
		return fmt.Errorf("docker run %s: %w", name, err)
	}
	return nil
}

// shellQuote wraps s in single quotes, escaping any single quotes within.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
}
