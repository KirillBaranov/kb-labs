package process

import (
	"encoding/json"
	"fmt"
	"os"
	"os/user"
	"path/filepath"
	"strings"
	"time"
)

// PIDInfo is a rich PID file — JSON with metadata, not just a bare number.
type PIDInfo struct {
	PID       int       `json:"pid"`
	PGID      int       `json:"pgid"`
	User      string    `json:"user"`
	Command   string    `json:"command"`
	Service   string    `json:"service"`
	StartedAt time.Time `json:"startedAt"`
}

// WritePID writes a rich PID file as JSON.
func WritePID(pidDir string, info PIDInfo) error {
	if err := os.MkdirAll(pidDir, 0o750); err != nil {
		return fmt.Errorf("create pid dir: %w", err)
	}

	data, err := json.MarshalIndent(info, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal pid info: %w", err)
	}

	path := filepath.Join(pidDir, info.Service+".pid")
	return os.WriteFile(path, data, 0o600)
}

// ReadPID reads a rich PID file. Returns nil (no error) if the file doesn't exist.
func ReadPID(pidDir, service string) (*PIDInfo, error) {
	path := filepath.Join(pidDir, service+".pid")
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read pid file: %w", err)
	}

	// Handle legacy bare-number PID files gracefully.
	trimmed := strings.TrimSpace(string(data))
	if len(trimmed) > 0 && trimmed[0] != '{' {
		// Legacy format: just a PID number.
		var pid int
		if _, err := fmt.Sscanf(trimmed, "%d", &pid); err == nil {
			return &PIDInfo{PID: pid, PGID: pid, Service: service}, nil
		}
	}

	var info PIDInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return nil, fmt.Errorf("parse pid file: %w", err)
	}
	return &info, nil
}

// RemovePID deletes the PID file for a service.
func RemovePID(pidDir, service string) error {
	path := filepath.Join(pidDir, service+".pid")
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove pid file: %w", err)
	}
	return nil
}

// Reconcile scans all PID files in pidDir and removes stale ones
// (where the process is no longer running).
// Returns a map of service → PIDInfo for still-alive processes.
func Reconcile(pidDir string) (map[string]*PIDInfo, error) {
	entries, err := os.ReadDir(pidDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read pid dir: %w", err)
	}

	alive := make(map[string]*PIDInfo)
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".pid") {
			continue
		}
		service := strings.TrimSuffix(e.Name(), ".pid")

		info, err := ReadPID(pidDir, service)
		if err != nil || info == nil {
			continue
		}

		if IsAlive(info.PID) {
			alive[service] = info
		} else {
			// Stale PID file — remove it.
			_ = RemovePID(pidDir, service)
		}
	}

	return alive, nil
}

// NewPIDInfo creates a PIDInfo with the current user and timestamp.
func NewPIDInfo(service string, pid, pgid int, command string) PIDInfo {
	username := "unknown"
	if u, err := user.Current(); err == nil {
		username = u.Username
	}

	return PIDInfo{
		PID:       pid,
		PGID:      pgid,
		User:      username,
		Command:   command,
		Service:   service,
		StartedAt: time.Now(),
	}
}
