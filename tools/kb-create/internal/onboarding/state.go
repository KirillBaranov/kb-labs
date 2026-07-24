// Package onboarding persists the minimal, non-secret state needed to resume
// a first-command handoff after the installer exits.
package onboarding

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/kb-labs/create/internal/manifest"
)

const relativeStatePath = ".kb/onboarding/state.json"

// State intentionally contains no credentials, diff, prompt, or analytics
// payload. It is safe to keep in the project as a recovery checkpoint.
type State struct {
	Version      int                    `json:"version"`
	Outcome      string                 `json:"outcome"`
	ProjectDir   string                 `json:"projectDir"`
	PlatformDir  string                 `json:"platformDir"`
	LocalMode    bool                   `json:"localMode"`
	Status       string                 `json:"status"`
	FirstCommand *manifest.FirstCommand `json:"firstCommand,omitempty"`
	UpdatedAt    time.Time              `json:"updatedAt"`
}

func Path(projectDir string) string { return filepath.Join(projectDir, relativeStatePath) }

func Write(state State) error {
	if state.ProjectDir == "" {
		return fmt.Errorf("onboarding project directory is required")
	}
	state.Version = 1
	state.UpdatedAt = time.Now().UTC()
	path := Path(state.ProjectDir)
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return fmt.Errorf("create onboarding directory: %w", err)
	}
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("encode onboarding state: %w", err)
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".state-*")
	if err != nil {
		return fmt.Errorf("create onboarding state: %w", err)
	}
	tmpName := tmp.Name()
	defer func() { _ = os.Remove(tmpName) }()
	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("secure onboarding state: %w", err)
	}
	if _, err := tmp.Write(append(data, '\n')); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("write onboarding state: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close onboarding state: %w", err)
	}
	if err := os.Rename(tmpName, path); err != nil {
		return fmt.Errorf("save onboarding state: %w", err)
	}
	return nil
}

func Read(projectDir string) (State, error) {
	data, err := os.ReadFile(Path(projectDir))
	if err != nil {
		return State{}, fmt.Errorf("read onboarding state: %w", err)
	}
	var state State
	if err := json.Unmarshal(data, &state); err != nil {
		return State{}, fmt.Errorf("decode onboarding state: %w", err)
	}
	if state.Version != 1 || state.ProjectDir == "" {
		return State{}, fmt.Errorf("unsupported or incomplete onboarding state")
	}
	return state, nil
}
