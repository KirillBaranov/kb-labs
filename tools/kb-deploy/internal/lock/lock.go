// Package lock reads and writes deploy.lock.json — the resolved,
// committed-to-git record of what apply actually put on each host (ADR-0014 §D5).
//
// The lock never contains secret values — only references and resolved
// package versions. Its git history is the audit trail.
package lock

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// SchemaVersion is the current lock schema tag.
const SchemaVersion = "kb.deploy.lock/1"

// Filename is the canonical filename in a deploy directory.
const Filename = "deploy.lock.json"

// Lock is the persisted state of the last successful apply.
type Lock struct {
	Schema      string                 `json:"schema"`
	GeneratedAt string                 `json:"generatedAt"`
	GeneratedBy string                 `json:"generatedBy"`
	Platform    PlatformLock           `json:"platform"`
	Services    map[string]ServiceLock `json:"services"`
	// Hosts records per-host state independent of any single service. Runtime
	// config is delivered per-host (all daemons share one file), so its hash
	// lives here, not duplicated across services (D19).
	Hosts map[string]HostLock `json:"hosts,omitempty"`
}

// PlatformLock records the platform version active at apply time.
type PlatformLock struct {
	Version string `json:"version,omitempty"`
}

// HostLock records per-host state recorded at apply time.
type HostLock struct {
	// ConfigHash is sha256 over the rendered config file plus the resolved
	// host env (values included, so secret rotation changes the hash and
	// forces a restart). One-way — safe to commit; raw values never stored.
	ConfigHash string `json:"configHash,omitempty"`
}

// ServiceLock records the resolved state of a single service across hosts.
type ServiceLock struct {
	Resolved  string                     `json:"resolved"`            // e.g. "@kb-labs/gateway@1.2.3"
	Integrity string                     `json:"integrity,omitempty"` // sha256-... over canonical inputs
	Adapters  map[string]ResolvedDep     `json:"adapters,omitempty"`
	Plugins   map[string]ResolvedDep     `json:"plugins,omitempty"`
	AppliedTo map[string]HostApplication `json:"appliedTo,omitempty"`
}

// ResolvedDep pins one adapter or plugin.
type ResolvedDep struct {
	Resolved  string `json:"resolved"`            // "@kb-labs/adapters-openai@0.4.1"
	Integrity string `json:"integrity,omitempty"` // sha256 from npm if known
}

// HostApplication is the record for one service × host pair.
type HostApplication struct {
	ReleaseID string    `json:"releaseId"`
	AppliedAt time.Time `json:"appliedAt"`
}

// New returns an empty lock stamped with the current schema and timestamp.
func New(generatedBy string) *Lock {
	return &Lock{
		Schema:      SchemaVersion,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		GeneratedBy: generatedBy,
		Services:    map[string]ServiceLock{},
	}
}

// Load reads the lock file next to the given deploy.yaml path. If the file does
// not exist, returns (nil, nil) — fresh-deployment case.
func Load(deployYAMLPath string) (*Lock, error) {
	dir := filepath.Dir(deployYAMLPath)
	path := filepath.Join(dir, Filename)
	data, err := os.ReadFile(path) //nolint:gosec // caller-controlled path
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", Filename, err)
	}
	var l Lock
	if err := json.Unmarshal(data, &l); err != nil {
		return nil, fmt.Errorf("parse %s: %w", Filename, err)
	}
	if l.Schema != SchemaVersion {
		return nil, fmt.Errorf("unsupported %s schema %q (want %q)", Filename, l.Schema, SchemaVersion)
	}
	if l.Services == nil {
		l.Services = map[string]ServiceLock{}
	}
	return &l, nil
}

// Save writes the lock to the directory containing deployYAMLPath.
func (l *Lock) Save(deployYAMLPath string) error {
	dir := filepath.Dir(deployYAMLPath)
	path := filepath.Join(dir, Filename)
	data, err := json.MarshalIndent(l, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal lock: %w", err)
	}
	tmp := path + ".tmp"
	// #nosec G306 -- lock file committed to git, readable.
	if err := os.WriteFile(tmp, append(data, '\n'), 0o644); err != nil {
		return fmt.Errorf("write %s: %w", Filename, err)
	}
	if err := os.Rename(tmp, path); err != nil {
		return fmt.Errorf("rename %s: %w", Filename, err)
	}
	return nil
}
