package scaffold

import (
	"os"
	"path/filepath"
	"strings"
)

// activePlatformPath is ~/.kb/active-platform: a single-line pointer to the
// most recently installed/updated platform directory. It exists so that
// `kb-dev` subcommands invoked with no project context (e.g. `kb-dev switch`
// run from an arbitrary directory, not from inside any KB Labs project) can
// still find "the platform" without requiring the caller to `cd` first.
//
// This machine currently supports one active platform install at a time —
// the pointer is overwritten on every `kb-create install`/`update`, matching
// how the CLI wrapper itself is already scoped to a single platform target
// (see internal/platform.WriteCLIWrapper).
func activePlatformPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".kb", "active-platform"), nil
}

// RecordActivePlatform writes platformDir to ~/.kb/active-platform.
// Best-effort: errors are returned but callers may choose to ignore them,
// since this pointer is a convenience fallback, not the source of truth
// (each project's own kb.config.jsonc "platform.dir" remains authoritative
// when kb-dev is invoked from inside a project).
func RecordActivePlatform(platformDir string) error {
	path, err := activePlatformPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return err
	}
	abs, err := filepath.Abs(platformDir)
	if err != nil {
		abs = platformDir
	}
	// #nosec G306 -- pointer file only ever contains a local filesystem path.
	return os.WriteFile(path, []byte(abs+"\n"), 0o644)
}

// ReadActivePlatform reads ~/.kb/active-platform. Returns "" if absent.
func ReadActivePlatform() string {
	path, err := activePlatformPath()
	if err != nil {
		return ""
	}
	data, err := os.ReadFile(path) // #nosec G304 -- fixed, user-owned path
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}
