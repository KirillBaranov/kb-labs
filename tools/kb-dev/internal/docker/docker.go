// Package docker checks Docker availability and manages containers.
package docker

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

const checkTimeout = 5 * time.Second

// Available returns true if the Docker daemon is responsive.
func Available() bool {
	ctx, cancel := context.WithTimeout(context.Background(), checkTimeout)
	defer cancel()
	return exec.CommandContext(ctx, "docker", "ps").Run() == nil
}

// Version returns the Docker version string, or empty if unavailable.
func Version() string {
	ctx, cancel := context.WithTimeout(context.Background(), checkTimeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, "docker", "version", "--format", "{{.Server.Version}}").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// ContainerRunning checks if a named container is running.
func ContainerRunning(name string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), checkTimeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, "docker", "ps",
		"--filter", fmt.Sprintf("name=^%s$", name),
		"--format", "{{.Status}}",
	).Output()
	if err != nil {
		return false
	}
	return strings.Contains(strings.ToLower(string(out)), "up")
}

// StopContainer stops a container by name.
func StopContainer(ctx context.Context, name string) error {
	cmd := exec.CommandContext(ctx, "docker", "stop", name)
	return cmd.Run()
}

// EnsureRunning guarantees Docker is available, starting Colima if needed (macOS).
func EnsureRunning(ctx context.Context) error {
	if Available() {
		return nil
	}
	return startColima(ctx)
}
