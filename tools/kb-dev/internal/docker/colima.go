package docker

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// startColima attempts to start Colima on macOS.
// Ported from dev.sh: start → detect stale → force stop → delete → retry.
func startColima(ctx context.Context) error {
	if _, err := exec.LookPath("colima"); err != nil {
		return fmt.Errorf("colima not installed (brew install colima)")
	}

	// Check if already running.
	if isColimaRunning() {
		return waitForDocker(ctx, 15*time.Second)
	}

	// Try normal start.
	out, err := runColima(ctx, "start")
	if err == nil {
		return waitForDocker(ctx, 60*time.Second)
	}

	// Check for stale VM.
	if isStaleError(out) {
		// Force stop and retry.
		_, _ = runColima(ctx, "stop", "--force")
		time.Sleep(2 * time.Second)

		if _, err := runColima(ctx, "start"); err == nil {
			return waitForDocker(ctx, 60*time.Second)
		}

		// Delete and retry as last resort.
		_, _ = runColima(ctx, "delete", "--force")
		time.Sleep(2 * time.Second)

		if _, err := runColima(ctx, "start"); err == nil {
			return waitForDocker(ctx, 60*time.Second)
		}
	}

	return fmt.Errorf("colima failed to start: %s", out)
}

func isColimaRunning() bool {
	ctx, cancel := context.WithTimeout(context.Background(), checkTimeout)
	defer cancel()
	return exec.CommandContext(ctx, "colima", "status").Run() == nil
}

func runColima(ctx context.Context, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "colima", args...)
	out, err := cmd.CombinedOutput()
	return string(out), err
}

func isStaleError(output string) bool {
	lower := strings.ToLower(output)
	stalePatterns := []string{
		"already in use",
		"lock",
		"already running",
		"qemu",
		"unable to open",
		"resource busy",
		"disk",
		"exit status 1",
	}
	for _, pattern := range stalePatterns {
		if strings.Contains(lower, pattern) {
			return true
		}
	}
	return false
}

func waitForDocker(ctx context.Context, timeout time.Duration) error {
	deadline := time.After(timeout)
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-deadline:
			return fmt.Errorf("docker not available after %s", timeout)
		case <-ticker.C:
			if Available() {
				return nil
			}
		}
	}
}
