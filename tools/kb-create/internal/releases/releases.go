package releases

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// SchemaVersion is the current releases.json schema tag.
const SchemaVersion = "kb.releases/1"

// Store is the on-disk index of installed releases for a platform directory.
// It lives at <platformDir>/releases.json and is the source of truth for what
// is installed on this host (ADR-0014).
type Store struct {
	Schema   string             `json:"schema"`
	Releases []Release          `json:"releases"`
	Current  map[string]string  `json:"current"`  // service package → release id
	Previous map[string]string  `json:"previous"` // service package → release id

	platformDir string // populated on Load; not serialised
}

// Release is a single installed release record.
type Release struct {
	ID        string            `json:"id"`
	Service   string            `json:"service"`   // npm package, e.g. "@kb-labs/gateway"
	Version   string            `json:"version"`   // semver
	Adapters  map[string]string `json:"adapters,omitempty"`
	Plugins   map[string]string `json:"plugins,omitempty"`
	CreatedAt time.Time         `json:"createdAt"`
	// Source indicates how the release was created: "install-service", "legacy-migration",
	// or a custom marker like "workspace@<git-sha>" (follow-up).
	Source string `json:"source,omitempty"`
}

// Load reads releases.json under platformDir. If the file does not exist, a
// fresh empty store is returned. platformDir must exist.
func Load(platformDir string) (*Store, error) {
	if _, err := os.Stat(platformDir); err != nil {
		return nil, fmt.Errorf("platform dir: %w", err)
	}
	path := filepath.Join(platformDir, "releases.json")
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return &Store{
			Schema:      SchemaVersion,
			Releases:    []Release{},
			Current:     map[string]string{},
			Previous:    map[string]string{},
			platformDir: platformDir,
		}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read releases.json: %w", err)
	}
	var s Store
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, fmt.Errorf("parse releases.json: %w", err)
	}
	if s.Schema != SchemaVersion {
		return nil, fmt.Errorf("unsupported releases.json schema %q (want %q)", s.Schema, SchemaVersion)
	}
	if s.Current == nil {
		s.Current = map[string]string{}
	}
	if s.Previous == nil {
		s.Previous = map[string]string{}
	}
	s.platformDir = platformDir
	return &s, nil
}

// Save writes the store back to releases.json atomically (write to a temp file,
// then rename). Uses a lock file to serialise concurrent kb-create invocations.
func (s *Store) Save() (err error) {
	if s.platformDir == "" {
		return errors.New("store has no platformDir (was it loaded via Load?)")
	}
	unlock, err := acquireLock(s.platformDir)
	if err != nil {
		return err
	}
	defer func() {
		if cerr := unlock(); cerr != nil && err == nil {
			err = cerr
		}
	}()

	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal releases.json: %w", err)
	}
	path := filepath.Join(s.platformDir, "releases.json")
	tmp := path + ".tmp"
	// #nosec G306 -- index file, readable alongside other platform state.
	if err := os.WriteFile(tmp, append(data, '\n'), 0o644); err != nil {
		return fmt.Errorf("write releases.json.tmp: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		return fmt.Errorf("rename releases.json: %w", err)
	}
	return nil
}

// Find returns the release with the given id, or nil if absent.
func (s *Store) Find(id string) *Release {
	for i := range s.Releases {
		if s.Releases[i].ID == id {
			return &s.Releases[i]
		}
	}
	return nil
}

// AppendRelease adds a release record. Duplicate ids are replaced in place,
// preserving order otherwise. Does not modify Current / Previous — that is the
// job of Swap (Phase 3).
func (s *Store) AppendRelease(r Release) {
	for i := range s.Releases {
		if s.Releases[i].ID == r.ID {
			s.Releases[i] = r
			return
		}
	}
	s.Releases = append(s.Releases, r)
}

// GC removes old releases for the given service, keeping at most `keep` (plus
// Current and Previous which are always protected per D20). Returns the ids
// that were evicted from the index; the caller is responsible for removing the
// on-disk directories.
//
// `keep` must be >= 1. If zero or negative, returns an error.
func (s *Store) GC(service string, keep int) ([]string, error) {
	if keep < 1 {
		return nil, fmt.Errorf("keep must be >= 1, got %d", keep)
	}

	// Gather releases for this service, ordered by CreatedAt descending (newest first).
	svcReleases := make([]Release, 0, len(s.Releases))
	for _, r := range s.Releases {
		if r.Service == service {
			svcReleases = append(svcReleases, r)
		}
	}
	sort.Slice(svcReleases, func(i, j int) bool {
		return svcReleases[i].CreatedAt.After(svcReleases[j].CreatedAt)
	})

	protected := map[string]struct{}{}
	if id, ok := s.Current[service]; ok {
		protected[id] = struct{}{}
	}
	if id, ok := s.Previous[service]; ok {
		protected[id] = struct{}{}
	}

	// Walk newest → oldest. Retain protected + first `keep` non-protected.
	var evict []string
	retained := 0
	for _, r := range svcReleases {
		if _, isProtected := protected[r.ID]; isProtected {
			continue
		}
		if retained < keep {
			retained++
			continue
		}
		evict = append(evict, r.ID)
	}

	if len(evict) == 0 {
		return nil, nil
	}

	// Prune index.
	evictSet := make(map[string]struct{}, len(evict))
	for _, id := range evict {
		evictSet[id] = struct{}{}
	}
	kept := s.Releases[:0]
	for _, r := range s.Releases {
		if _, drop := evictSet[r.ID]; drop {
			continue
		}
		kept = append(kept, r)
	}
	s.Releases = kept
	return evict, nil
}

// acquireLock is implemented in releases_lock_unix.go (Unix) and
// releases_lock_windows.go (Windows) via build tags.
