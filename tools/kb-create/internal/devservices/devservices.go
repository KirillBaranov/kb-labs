// Package devservices maintains <platformDir>/.kb/devservices.yaml — the
// registry kb-dev reads to know how to start, stop and health-check each
// installed service. kb-create updates one entry at a time on swap, so the
// update is additive and preserves existing services written by earlier
// installs or by the user.
package devservices

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// Filename is the filename kb-dev expects.
const Filename = "devservices.yaml"

// File is the minimal schema shared with kb-dev. Fields are a subset sufficient
// for start/restart/health operations; informational fields (description, note,
// api.*) are kept intact on disk via node-level merge.
type File struct {
	Name     string             `yaml:"name,omitempty"`
	Services map[string]Service `yaml:"services,omitempty"`
}

// Service is one entry under services:.
type Service struct {
	Name        string            `yaml:"name,omitempty"`
	Description string            `yaml:"description,omitempty"`
	Type        string            `yaml:"type,omitempty"` // "node" | "docker"; default "node"
	Command     string            `yaml:"command"`
	HealthCheck string            `yaml:"health_check,omitempty"`
	Port        int               `yaml:"port,omitempty"`
	URL         string            `yaml:"url,omitempty"`
	Env         map[string]string `yaml:"env,omitempty"`
	DependsOn   []string          `yaml:"depends_on,omitempty"`
}

// Path returns the canonical location of devservices.yaml for platformDir.
func Path(platformDir string) string {
	return filepath.Join(platformDir, ".kb", Filename)
}

// Load reads the file at Path(platformDir). Missing file returns an empty File
// with an initialised Services map — callers can Upsert straight away.
func Load(platformDir string) (*File, error) {
	p := Path(platformDir)
	data, err := os.ReadFile(p) //nolint:gosec // path built from caller-owned dir
	if os.IsNotExist(err) {
		return &File{Services: map[string]Service{}}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", Filename, err)
	}
	var f File
	if err := yaml.Unmarshal(data, &f); err != nil {
		return nil, fmt.Errorf("parse %s: %w", Filename, err)
	}
	if f.Services == nil {
		f.Services = map[string]Service{}
	}
	return &f, nil
}

// Upsert replaces the entry for id with svc. Existing entries for other ids
// are preserved unchanged.
func (f *File) Upsert(id string, svc Service) {
	if f.Services == nil {
		f.Services = map[string]Service{}
	}
	f.Services[id] = svc
}

// Remove drops the entry for id, if any.
func (f *File) Remove(id string) {
	delete(f.Services, id)
}

// Save writes the file atomically (write temp → rename), creating the .kb/
// directory if missing. A file-level flock guards concurrent kb-create runs
// on the same platformDir.
func (f *File) Save(platformDir string) (err error) {
	unlock, err := acquireLock(platformDir)
	if err != nil {
		return err
	}
	defer func() {
		if cerr := unlock(); cerr != nil && err == nil {
			err = cerr
		}
	}()

	dir := filepath.Join(platformDir, ".kb")
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return fmt.Errorf("create .kb: %w", err)
	}
	data, err := yaml.Marshal(f)
	if err != nil {
		return fmt.Errorf("marshal devservices: %w", err)
	}
	p := filepath.Join(dir, Filename)
	tmp := p + ".tmp"
	// #nosec G306 -- config file, readable.
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return fmt.Errorf("write %s.tmp: %w", Filename, err)
	}
	if err := os.Rename(tmp, p); err != nil {
		return fmt.Errorf("rename %s: %w", Filename, err)
	}
	return nil
}

// acquireLock is implemented in devservices_lock_unix.go (Unix) and
// devservices_lock_windows.go (Windows) via build tags.
