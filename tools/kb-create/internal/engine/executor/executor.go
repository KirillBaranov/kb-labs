// Package executor runs a compiled action graph. It knows nothing about
// scenarios or UI; concrete side effects are supplied by action handlers.
package executor

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"time"

	"github.com/kb-labs/create/internal/engine/plan"
)

type Status string

const (
	StatusPending        Status = "pending"
	StatusChecking       Status = "checking"
	StatusApplying       Status = "applying"
	StatusVerifying      Status = "verifying"
	StatusCompleted      Status = "completed"
	StatusPlanned        Status = "planned"
	StatusFailed         Status = "failed"
	StatusRollingBack    Status = "rolling-back"
	StatusRolledBack     Status = "rolled-back"
	StatusRollbackFailed Status = "rollback-failed"
)

type ActionResult struct{ Output map[string]string }

type Handler interface {
	Check(context.Context, plan.PlanAction) (bool, error)
	Apply(context.Context, plan.PlanAction) (ActionResult, error)
	Verify(context.Context, plan.PlanAction, ActionResult) error
}

type RollbackHandler interface {
	Rollback(context.Context, plan.PlanAction, ActionResult) error
}

type HandlerRegistry map[plan.ActionKind]Handler

type JournalEntry struct {
	ActionID string    `json:"actionId"`
	Status   Status    `json:"status"`
	Attempts int       `json:"attempts,omitempty"`
	Error    string    `json:"error,omitempty"`
	Started  time.Time `json:"started,omitempty"`
	Finished time.Time `json:"finished,omitempty"`
}

type Journal struct {
	PlanHash string         `json:"planHash"`
	Entries  []JournalEntry `json:"entries"`
}

type Event struct {
	ActionID string
	Status   Status
}

type Options struct {
	DryRun            bool
	Emit              func(Event)
	Store             JournalStore
	Lock              Lock
	RollbackOnFailure bool
}

type Lock interface {
	Acquire(context.Context, string) (func() error, error)
}

type FileLock struct{ Path string }

func (l FileLock) Acquire(_ context.Context, planHash string) (func() error, error) {
	if l.Path == "" {
		return nil, fmt.Errorf("lock path is empty")
	}
	if parent := filepath.Dir(l.Path); parent != "." {
		if err := os.MkdirAll(parent, 0o750); err != nil {
			return nil, err
		}
	}
	if err := os.Mkdir(l.Path, 0o750); err != nil {
		if os.IsExist(err) {
			return nil, fmt.Errorf("install lock already exists at %s", l.Path)
		}
		return nil, err
	}
	metadata := []byte("{\n  \"pid\": " + strconv.Itoa(os.Getpid()) + ",\n  \"planHash\": \"" + planHash + "\",\n  \"createdAt\": \"" + time.Now().UTC().Format(time.RFC3339Nano) + "\"\n}\n")
	if err := os.WriteFile(filepath.Join(l.Path, "owner.json"), metadata, 0o600); err != nil {
		_ = os.RemoveAll(l.Path)
		return nil, err
	}
	return func() error { return os.RemoveAll(l.Path) }, nil
}

type JournalStore interface {
	Load(context.Context, string) (Journal, bool, error)
	Save(context.Context, Journal) error
}

type FileJournalStore struct{ Dir string }

func (s FileJournalStore) path(planHash string) string { return filepath.Join(s.Dir, planHash+".json") }

func (s FileJournalStore) Load(_ context.Context, planHash string) (Journal, bool, error) {
	data, err := os.ReadFile(s.path(planHash)) // #nosec G304 -- path is derived from the plan hash and configured journal dir.
	if os.IsNotExist(err) {
		return Journal{}, false, nil
	}
	if err != nil {
		return Journal{}, false, err
	}
	var journal Journal
	if err := json.Unmarshal(data, &journal); err != nil {
		return Journal{}, false, fmt.Errorf("decode journal: %w", err)
	}
	if journal.PlanHash != planHash {
		return Journal{}, false, fmt.Errorf("journal plan hash mismatch")
	}
	return journal, true, nil
}

func (s FileJournalStore) Save(_ context.Context, journal Journal) error {
	if s.Dir == "" {
		return fmt.Errorf("journal directory is empty")
	}
	if err := os.MkdirAll(s.Dir, 0o750); err != nil {
		return err
	}
	data, err := json.MarshalIndent(journal, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(s.Dir, ".journal-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	ok := false
	defer func() {
		if !ok {
			_ = os.Remove(name)
		}
	}()
	if err = tmp.Chmod(0o600); err == nil {
		_, err = tmp.Write(append(data, '\n'))
	}
	if closeErr := tmp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	if err = os.Rename(name, s.path(journal.PlanHash)); err != nil {
		return err
	}
	ok = true
	return nil
}

func Run(ctx context.Context, compiled plan.InstallPlan, handlers HandlerRegistry, options Options) (Journal, error) {
	var release func() error
	var err error
	if !options.DryRun && options.Lock != nil {
		release, err = options.Lock.Acquire(ctx, compiled.PlanHash)
		if err != nil {
			return Journal{}, err
		}
		defer func() { _ = release() }()
	}
	ordered, err := order(compiled.Actions)
	if err != nil {
		return Journal{}, err
	}
	journal := Journal{PlanHash: compiled.PlanHash, Entries: make([]JournalEntry, 0, len(ordered))}
	if options.Store != nil {
		stored, exists, loadErr := options.Store.Load(ctx, compiled.PlanHash)
		if loadErr != nil {
			return Journal{}, loadErr
		}
		if exists {
			journal = stored
		}
	}
	completed := make(map[string]bool)
	touched := make([]executedAction, 0, len(ordered))
	for _, entry := range journal.Entries {
		if entry.Status == StatusCompleted {
			completed[entry.ActionID] = true
		}
	}
	for _, action := range ordered {
		if completed[action.ID] {
			continue
		}
		entry := JournalEntry{ActionID: action.ID, Status: StatusPending, Started: time.Now()}
		notify(options, action.ID, entry.Status)
		if options.DryRun {
			entry.Status = StatusPlanned
			entry.Finished = time.Now()
			journal.Entries = append(journal.Entries, entry)
			notify(options, action.ID, entry.Status)
			continue
		}
		handler, ok := handlers[action.Kind]
		if !ok {
			return failAndSave(ctx, options.Store, journal, entry, fmt.Errorf("no handler for action kind %q", action.Kind))
		}
		result, applied, actionErr := executeAction(ctx, handler, action, &entry, options)
		if actionErr != nil {
			if applied && options.RollbackOnFailure {
				rollbackErr := rollbackActions(ctx, options, journal, append(touched, executedAction{action: action, handler: handler, result: result}))
				if rollbackErr != nil {
					actionErr = fmt.Errorf("%w; rollback: %v", actionErr, rollbackErr)
				}
			}
			return failAndSave(ctx, options.Store, journal, entry, actionErr)
		}
		if applied {
			touched = append(touched, executedAction{action: action, handler: handler, result: result})
		}
		entry.Status = StatusCompleted
		entry.Finished = time.Now()
		journal.Entries = append(journal.Entries, entry)
		if err := saveJournal(ctx, options.Store, journal); err != nil {
			return journal, err
		}
		notify(options, action.ID, entry.Status)
	}
	return journal, nil
}

type executedAction struct {
	action  plan.PlanAction
	handler Handler
	result  ActionResult
}

func executeAction(ctx context.Context, handler Handler, action plan.PlanAction, entry *JournalEntry, options Options) (ActionResult, bool, error) {
	attempts := action.Retry.MaxAttempts
	if attempts < 1 {
		attempts = 1
	}
	var last error
	var lastResult ActionResult
	applied := false
	for attempt := 1; attempt <= attempts; attempt++ {
		if err := ctx.Err(); err != nil {
			return lastResult, applied, err
		}
		entry.Attempts = attempt
		entry.Status = StatusChecking
		notify(options, action.ID, entry.Status)
		ready, err := handler.Check(ctx, action)
		if err == nil && !ready {
			entry.Status = StatusApplying
			notify(options, action.ID, entry.Status)
			var result ActionResult
			result, err = handler.Apply(ctx, action)
			lastResult = result
			applied = true
			if err == nil {
				entry.Status = StatusVerifying
				notify(options, action.ID, entry.Status)
				err = handler.Verify(ctx, action, result)
			}
		}
		if err == nil {
			return lastResult, applied, nil
		}
		last = err
		if attempt < attempts {
			backoff := time.Duration(action.Retry.BackoffMillis) * time.Millisecond
			if backoff > 0 {
				timer := time.NewTimer(backoff)
				select {
				case <-ctx.Done():
					timer.Stop()
					return lastResult, applied, ctx.Err()
				case <-timer.C:
				}
			}
		}
	}
	return lastResult, applied, last
}

func rollbackActions(ctx context.Context, options Options, journal Journal, actions []executedAction) error {
	var first error
	for i := len(actions) - 1; i >= 0; i-- {
		action := actions[i]
		if action.action.Rollback != plan.RollbackHandler {
			continue
		}
		handler, ok := action.handler.(RollbackHandler)
		if !ok {
			if first == nil {
				first = fmt.Errorf("action %s declares rollback but handler does not implement it", action.action.ID)
			}
			continue
		}
		notify(options, action.action.ID, StatusRollingBack)
		if err := handler.Rollback(ctx, action.action, action.result); err != nil {
			if first == nil {
				first = fmt.Errorf("action %s rollback: %w", action.action.ID, err)
			}
			notify(options, action.action.ID, StatusRollbackFailed)
			continue
		}
		notify(options, action.action.ID, StatusRolledBack)
	}
	return first
}

func saveJournal(ctx context.Context, store JournalStore, journal Journal) error {
	if store == nil {
		return nil
	}
	return store.Save(ctx, journal)
}

func order(actions []plan.PlanAction) ([]plan.PlanAction, error) {
	byID := make(map[string]plan.PlanAction, len(actions))
	for _, action := range actions {
		if action.ID == "" {
			return nil, fmt.Errorf("action has empty id")
		}
		if _, exists := byID[action.ID]; exists {
			return nil, fmt.Errorf("duplicate action %q", action.ID)
		}
		byID[action.ID] = action
	}
	for _, action := range actions {
		for _, dependency := range action.DependsOn {
			if _, ok := byID[dependency]; !ok {
				return nil, fmt.Errorf("action %q depends on missing action %q", action.ID, dependency)
			}
		}
	}
	result := make([]plan.PlanAction, 0, len(actions))
	visited := map[string]bool{}
	visiting := map[string]bool{}
	var visit func(string) error
	visit = func(id string) error {
		if visited[id] {
			return nil
		}
		if visiting[id] {
			return fmt.Errorf("action dependency cycle at %q", id)
		}
		visiting[id] = true
		deps := append([]string(nil), byID[id].DependsOn...)
		sort.Strings(deps)
		for _, dependency := range deps {
			if err := visit(dependency); err != nil {
				return err
			}
		}
		delete(visiting, id)
		visited[id] = true
		result = append(result, byID[id])
		return nil
	}
	ids := make([]string, 0, len(actions))
	for id := range byID {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		if err := visit(id); err != nil {
			return nil, err
		}
	}
	return result, nil
}

func failJournal(journal Journal, entry JournalEntry, err error) (Journal, error) {
	entry.Status = StatusFailed
	entry.Error = err.Error()
	entry.Finished = time.Now()
	journal.Entries = append(journal.Entries, entry)
	return journal, fmt.Errorf("action %s failed: %w", entry.ActionID, err)
}

func failAndSave(ctx context.Context, store JournalStore, journal Journal, entry JournalEntry, err error) (Journal, error) {
	journal, runErr := failJournal(journal, entry, err)
	if saveErr := saveJournal(ctx, store, journal); runErr == nil {
		runErr = saveErr
	}
	return journal, runErr
}

func notify(options Options, actionID string, status Status) {
	if options.Emit != nil {
		options.Emit(Event{ActionID: actionID, Status: status})
	}
}
