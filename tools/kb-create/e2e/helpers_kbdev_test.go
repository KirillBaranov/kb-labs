// Helpers for invoking the installed kb-dev binary and parsing its JSON output.
//
// These helpers are test-only (_test.go) and assume `<platformDir>/bin/kb-dev`
// exists because the installer's bindown step dropped it there. See
// internal/installer/installer.go:270 — `binDir := filepath.Join(platformDir, "bin")`.

package e2e

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
)

// kbDevBinary returns the absolute path to the kb-dev binary dropped by the
// installer. Appends `.exe` on Windows.
func kbDevBinary(platformDir string) string {
	name := "kb-dev"
	if runtime.GOOS == "windows" {
		name = "kb-dev.exe"
	}
	return filepath.Join(platformDir, "bin", name)
}

// runKbDev invokes the installed kb-dev binary with KB_PROJECT_ROOT set to the
// platform dir. Returns combined output, stderr, and exit code.
func runKbDev(t *testing.T, platformDir string, args ...string) (string, string, int) {
	t.Helper()
	bin := kbDevBinary(platformDir)

	cmd := exec.CommandContext(context.Background(), bin, args...) // #nosec G204 -- bin path is derived from t.TempDir()
	cmd.Env = append(os.Environ(),
		"KB_PROJECT_ROOT="+platformDir,
	)
	cmd.Dir = platformDir

	// Capture stdout and stderr separately — JSON output is on stdout, logs on stderr.
	var stdout, stderr []byte
	var err error
	stdoutPipe, _ := cmd.StdoutPipe()
	stderrPipe, _ := cmd.StderrPipe()
	if err = cmd.Start(); err != nil {
		return "", err.Error(), -1
	}
	stdout, _ = readAll(stdoutPipe)
	stderr, _ = readAll(stderrPipe)
	err = cmd.Wait()

	code := 0
	if err != nil {
		if exit, ok := err.(*exec.ExitError); ok {
			code = exit.ExitCode()
		} else {
			code = -1
		}
	}
	return string(stdout), string(stderr), code
}

// kbDevStatusJSON runs `kb-dev status --json` and parses the stdout as JSON.
// Returns a parsed map so the test can make lightweight assertions without
// hardcoding a schema (kb-dev's own unit tests cover the strict schema).
func kbDevStatusJSON(t *testing.T, platformDir string) (map[string]any, error) {
	t.Helper()
	stdout, stderr, code := runKbDev(t, platformDir, "status", "--json")
	if code != 0 && stdout == "" {
		return nil, fmt.Errorf("kb-dev status --json exited %d\nstderr:\n%s", code, stderr)
	}
	var parsed map[string]any
	if err := json.Unmarshal([]byte(stdout), &parsed); err != nil {
		return nil, fmt.Errorf("kb-dev status --json produced invalid JSON: %w\nstdout:\n%s", err, stdout)
	}
	return parsed, nil
}

// readAll drains an io.Reader into a byte slice, swallowing read errors.
// We want best-effort capture of output even if the pipe closes unexpectedly.
func readAll(r interface{ Read(p []byte) (int, error) }) ([]byte, error) {
	var out []byte
	buf := make([]byte, 4096)
	for {
		n, err := r.Read(buf)
		if n > 0 {
			out = append(out, buf[:n]...)
		}
		if err != nil {
			return out, nil
		}
	}
}
