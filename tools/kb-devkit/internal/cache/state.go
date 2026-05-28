package cache

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

// TaskStateKind represents whether a (package, task) pair needs to be re-run.
type TaskStateKind string

const (
	TaskStateDirty TaskStateKind = "dirty"
	TaskStateClean TaskStateKind = "clean"
)

// TaskState records the last known execution outcome for a (package, task) pair.
type TaskState struct {
	Kind      TaskStateKind `json:"state"`
	Reason    string        `json:"reason,omitempty"` // last_run_failed | not_executed
	InputHash string        `json:"inputHash,omitempty"`
	UpdatedAt time.Time     `json:"updatedAt"`
}

// StateStore persists (package, task) dirty/clean state on disk.
// Layout: <cacheRoot>/state/<pkg-slug>/<task>.json
//
// A missing file is treated as DIRTY — first run after upgrade or new package
// always re-runs all tasks exactly once, then state is maintained going forward.
type StateStore struct {
	root string
}

// NewStateStore creates a StateStore backed by root.
// Directories are created lazily on first write, not in this constructor.
func NewStateStore(root string) *StateStore {
	return &StateStore{root: root}
}

func (ss *StateStore) statePath(pkg, task string) string {
	return filepath.Join(ss.root, "state", pkgSlug(pkg), task+".json")
}

// Get returns the TaskState for (pkg, task), or (zero, false) on miss/error.
func (ss *StateStore) Get(pkg, task string) (TaskState, bool) {
	data, err := os.ReadFile(ss.statePath(pkg, task))
	if err != nil {
		return TaskState{}, false
	}
	var st TaskState
	if err := json.Unmarshal(data, &st); err != nil {
		return TaskState{}, false
	}
	return st, true
}

// SetClean records a successful execution for (pkg, task) with the given inputHash.
func (ss *StateStore) SetClean(pkg, task, inputHash string) error {
	return ss.write(pkg, task, TaskState{
		Kind:      TaskStateClean,
		InputHash: inputHash,
		UpdatedAt: time.Now().UTC(),
	})
}

// SetDirty marks (pkg, task) as needing re-execution with the given reason.
func (ss *StateStore) SetDirty(pkg, task, reason string) error {
	return ss.write(pkg, task, TaskState{
		Kind:      TaskStateDirty,
		Reason:    reason,
		UpdatedAt: time.Now().UTC(),
	})
}

// IsDirty returns true if the (pkg, task) pair needs to be re-run.
// A missing state file is treated as dirty.
func (ss *StateStore) IsDirty(pkg, task string) bool {
	st, ok := ss.Get(pkg, task)
	if !ok {
		return true // unknown = needs run
	}
	return st.Kind == TaskStateDirty
}

// write persists a TaskState atomically via temp-file + rename.
func (ss *StateStore) write(pkg, task string, st TaskState) error {
	path := ss.statePath(pkg, task)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
