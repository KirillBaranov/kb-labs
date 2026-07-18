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
	"sort"
	"strings"

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
	// Socket is the unix domain socket path template (may contain ${KB_SOCKET_HASH},
	// which kb-dev expands per project root). Set when a service binds a unix socket
	// instead of a TCP port for internal transport.
	Socket    string            `yaml:"socket,omitempty"`
	URL       string            `yaml:"url,omitempty"`
	Env       map[string]string `yaml:"env,omitempty"`
	DependsOn []string          `yaml:"depends_on,omitempty"`
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

// PruneUnknownDeps removes every dependsOn entry that does not name a service
// present in the file, returning each dropped "service→dep" pair (sorted).
//
// kb-create writes each service's full manifest dependencies on swap, one
// service at a time, so the file can transiently reference services that are
// external (e.g. qdrant, not managed by kb-dev) or not yet registered. kb-dev
// validates the registry strictly and rejects unknown dependencies. Running
// this once, after every service of a deployment is registered, yields a
// self-consistent registry: real inter-service deps are kept (their targets are
// present) while external/undeployed ones are dropped.
func (f *File) PruneUnknownDeps() []string {
	var dropped []string
	for id, svc := range f.Services {
		if len(svc.DependsOn) == 0 {
			continue
		}
		kept := make([]string, 0, len(svc.DependsOn))
		for _, dep := range svc.DependsOn {
			if _, ok := f.Services[dep]; ok {
				kept = append(kept, dep)
				continue
			}
			dropped = append(dropped, fmt.Sprintf("%s→%s", id, dep))
		}
		svc.DependsOn = kept
		f.Services[id] = svc
	}
	sort.Strings(dropped)
	return dropped
}

// Validate rejects structural problems that would otherwise only surface
// later, when kb-dev tries to start services from this file: a service with
// no Command, or two services claiming the same port. Both are currently
// caught on the READ side by tools/kb-dev/internal/config (TestLoadDetectsDuplicatePort
// etc.) — this closes the same gap at write time, so a bad entry never makes
// it to disk in the first place.
func (f *File) Validate() error {
	ids := make([]string, 0, len(f.Services))
	for id := range f.Services {
		ids = append(ids, id)
	}
	sort.Strings(ids) // deterministic error messages regardless of map iteration order

	portOwner := make(map[int]string, len(f.Services))
	for _, id := range ids {
		svc := f.Services[id]
		if strings.TrimSpace(svc.Command) == "" {
			return fmt.Errorf("service %q: command is required", id)
		}
		if svc.Port == 0 {
			continue // no port (e.g. unix-socket-only service) — nothing to collide
		}
		if owner, ok := portOwner[svc.Port]; ok {
			return fmt.Errorf("services %q and %q both claim port %d", owner, id, svc.Port)
		}
		portOwner[svc.Port] = id
	}
	return nil
}

// Save writes the file atomically (write temp → rename), creating the .kb/
// directory if missing. A file-level flock guards concurrent kb-create runs
// on the same platformDir.
func (f *File) Save(platformDir string) (err error) {
	if err := f.Validate(); err != nil {
		return fmt.Errorf("invalid devservices: %w", err)
	}

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
