// Package state manages persistent deploy state (last SHA per target).
package state

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

// State holds the last deploy record for all targets.
type State struct {
	Targets map[string]TargetState `json:"targets"`
}

// TargetState records the last deploy attempt for a single target.
type TargetState struct {
	SHA        string    `json:"sha"`
	Status     string    `json:"status,omitempty"`      // "success" | "failed" | "" (legacy = success)
	FailReason string    `json:"fail_reason,omitempty"` // "bundle" | "build" | "push" | "ssh"
	DeployedAt time.Time `json:"deployed_at"`
}

// IsLastDeployFailed reports whether the last deploy attempt for target failed.
// Returns false for missing targets and legacy records with empty Status.
func (s *State) IsLastDeployFailed(target string) bool {
	ts, ok := s.Targets[target]
	return ok && ts.Status == "failed"
}

// Load reads state from path. Returns an empty State if the file doesn't exist.
func Load(path string) (*State, error) {
	s := &State{Targets: make(map[string]TargetState)}

	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return s, nil
	}
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(data, s); err != nil {
		return nil, err
	}
	if s.Targets == nil {
		s.Targets = make(map[string]TargetState)
	}
	return s, nil
}

// Save writes state to path, creating parent directories as needed.
func Save(path string, s *State) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}
