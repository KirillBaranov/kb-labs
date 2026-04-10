// Package process manages OS processes with process groups and rich PID files.
package process

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/kb-labs/dev/internal/environ"
)

// SpawnOpts configures how a process is started.
type SpawnOpts struct {
	Command  string            // shell command to execute
	Env      map[string]string // additional environment variables
	Dir      string            // working directory (defaults to current)
	LogFile  string            // stdout+stderr redirect (file path)
	EnvCache *environ.EnvCache // resolved environment (optional, avoids bash -l)
}

// SpawnResult contains the process info after a successful spawn.
type SpawnResult struct {
	Process *os.Process
	PID     int
	PGID    int
}

// Spawn starts a process in its own process group.
//
// For simple commands (no &&, |, ;): prepends "exec" so bash is replaced by the
// real process, giving us the true PID.
//
// For compound commands: bash remains as the process group leader, and Setpgid
// ensures the whole group is killable.
//
// If EnvCache is provided, uses resolved PATH instead of login shell (-l).
func Spawn(opts SpawnOpts) (*SpawnResult, error) {
	shellArgs := buildShellArgs(opts.Command)

	cmd := exec.Command(shellArgs[0], shellArgs[1:]...)
	setProcAttrs(cmd)

	if opts.Dir != "" {
		cmd.Dir = opts.Dir
	}

	// Build environment.
	cmd.Env = buildEnv(opts.Env, opts.EnvCache)

	// Redirect stdout+stderr to log file.
	if opts.LogFile != "" {
		logFile, err := os.OpenFile(opts.LogFile, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
		if err != nil {
			return nil, fmt.Errorf("open log file: %w", err)
		}
		cmd.Stdout = logFile
		cmd.Stderr = logFile
		// Note: logFile is intentionally not closed here — the child process
		// inherits the fd and writes to it. The OS closes it when the process exits.
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start process: %w", err)
	}

	pid := cmd.Process.Pid
	pgid, err := getPgid(pid)
	if err != nil {
		pgid = pid // fallback: use PID as PGID
	}

	return &SpawnResult{
		Process: cmd.Process,
		PID:     pid,
		PGID:    pgid,
	}, nil
}

// buildShellArgs constructs the shell command arguments.
// Simple commands get "exec" prefix for true PID tracking.
func buildShellArgs(command string) []string {
	isCompound := strings.ContainsAny(command, "&|;")

	if isCompound {
		return []string{"bash", "-c", command}
	}
	return []string{"bash", "-c", "exec " + command}
}

// buildEnv constructs the environment for the child process.
func buildEnv(extra map[string]string, cache *environ.EnvCache) []string {
	env := os.Environ()

	// If we have a resolved environment cache, inject the PATH.
	if cache != nil {
		resolvedPath := cache.BuildPath()
		if resolvedPath != "" {
			env = setEnvVar(env, "PATH", resolvedPath)
		}
	}

	// Add service-specific env vars.
	for k, v := range extra {
		env = setEnvVar(env, k, v)
	}

	return env
}

// setEnvVar sets or replaces an environment variable in a slice.
func setEnvVar(env []string, key, value string) []string {
	prefix := key + "="
	for i, e := range env {
		if strings.HasPrefix(e, prefix) {
			env[i] = prefix + value
			return env
		}
	}
	return append(env, prefix+value)
}
