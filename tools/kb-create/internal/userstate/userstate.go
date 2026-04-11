// Package userstate persists kb-create's "last known install" across runs
// in a user-level state file. This lets commands like `kb-create status`,
// `kb-create doctor`, `kb-create update`, and `kb-create uninstall` work
// without the user passing `--platform` every time.
//
// Location (per the XDG Base Directory spec, with Darwin/Windows fallbacks):
//
//	$XDG_STATE_HOME/kb-create/state.json
//	~/.local/state/kb-create/state.json          (Linux/Darwin fallback)
//	%LOCALAPPDATA%\kb-create\state.json          (Windows)
//
// The file stores the last-installed platform + project directories.
// Callers must tolerate a missing or stale file (e.g. user deleted the
// platform directory) by checking existence before trusting the paths.
package userstate

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"time"
)

// State is the persisted shape of the user-level state file.
type State struct {
	LastPlatformDir string    `json:"lastPlatformDir"`
	LastProjectDir  string    `json:"lastProjectDir,omitempty"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

// Path returns the absolute path to the user state file for the current OS.
// It does not create the file or its parent directory.
func Path() (string, error) {
	base, err := stateBaseDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "kb-create", "state.json"), nil
}

// Read loads the state file. Returns (nil, nil) if the file does not exist
// — callers should treat that as "no prior install known" rather than an
// error. Other I/O or parse errors are returned.
func Read() (*State, error) {
	p, err := Path()
	if err != nil {
		return nil, err
	}
	// #nosec G304 -- path is derived from well-known user state dirs.
	data, err := os.ReadFile(p)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	var s State
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

// Write persists the state file atomically (write-to-temp + rename).
// Creates the parent directory if needed.
func Write(s *State) error {
	p, err := Path()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	if s.UpdatedAt.IsZero() {
		s.UpdatedAt = time.Now().UTC()
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}

// Clear removes the state file. Returns nil if the file does not exist.
func Clear() error {
	p, err := Path()
	if err != nil {
		return err
	}
	err = os.Remove(p)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

// stateBaseDir resolves the platform-appropriate base directory for state.
// Honors KB_CREATE_STATE_HOME for tests.
func stateBaseDir() (string, error) {
	if override := os.Getenv("KB_CREATE_STATE_HOME"); override != "" {
		return override, nil
	}
	if xdg := os.Getenv("XDG_STATE_HOME"); xdg != "" {
		return xdg, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	if runtime.GOOS == "windows" {
		if local := os.Getenv("LOCALAPPDATA"); local != "" {
			return local, nil
		}
		return filepath.Join(home, "AppData", "Local"), nil
	}
	return filepath.Join(home, ".local", "state"), nil
}
