package executor

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"

	"github.com/kb-labs/create/internal/engine/plan"
)

type testHandler struct {
	calls *[]string
	ready bool
}

func (h testHandler) Check(context.Context, plan.PlanAction) (bool, error) {
	*h.calls = append(*h.calls, "check:"+strconv.FormatBool(h.ready))
	return h.ready, nil
}
func (h testHandler) Apply(context.Context, plan.PlanAction) (ActionResult, error) {
	*h.calls = append(*h.calls, "apply")
	return ActionResult{}, nil
}
func (h testHandler) Verify(context.Context, plan.PlanAction, ActionResult) error {
	*h.calls = append(*h.calls, "verify")
	return nil
}

func TestRunUsesDeterministicDependencyOrderAndDryRun(t *testing.T) {
	actions := []plan.PlanAction{{ID: "config", Kind: plan.ActionWriteConfig, DependsOn: []string{"bind", "install"}}, {ID: "install", Kind: plan.ActionInstallPackage}, {ID: "bind", Kind: plan.ActionBindProvider, DependsOn: []string{"install"}}}
	compiled := plan.InstallPlan{PlanHash: "hash", Actions: actions}
	var events []string
	journal, err := Run(context.Background(), compiled, nil, Options{DryRun: true, Emit: func(event Event) { events = append(events, event.ActionID+":"+string(event.Status)) }})
	if err != nil {
		t.Fatal(err)
	}
	ids := make([]string, 0, len(journal.Entries))
	for _, entry := range journal.Entries {
		ids = append(ids, entry.ActionID)
	}
	if !reflect.DeepEqual(ids, []string{"install", "bind", "config"}) {
		t.Fatalf("order = %#v", ids)
	}
	if len(events) != 6 || journal.Entries[2].Status != StatusPlanned {
		t.Fatalf("events/journal = %#v / %#v", events, journal)
	}
}

func TestDryRunDoesNotPersistJournal(t *testing.T) {
	store := FileJournalStore{Dir: filepath.Join(t.TempDir(), "runs")}
	_, err := Run(context.Background(), plan.InstallPlan{PlanHash: "dry", Actions: []plan.PlanAction{{ID: "a", Kind: plan.ActionInstallPackage}}}, nil, Options{DryRun: true, Store: store})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(store.Dir, "dry.json")); !os.IsNotExist(err) {
		t.Fatalf("dry-run journal exists: %v", err)
	}
}

func TestRunChecksAppliesAndVerifies(t *testing.T) {
	var calls []string
	handler := testHandler{calls: &calls}
	_, err := Run(context.Background(), plan.InstallPlan{Actions: []plan.PlanAction{{ID: "install", Kind: plan.ActionInstallPackage}}}, HandlerRegistry{plan.ActionInstallPackage: handler}, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(calls, []string{"check:false", "apply", "verify"}) {
		t.Fatalf("calls = %#v", calls)
	}
}

func TestRunRejectsCyclesAndMissingHandlers(t *testing.T) {
	_, err := Run(context.Background(), plan.InstallPlan{Actions: []plan.PlanAction{{ID: "a", Kind: plan.ActionInstallPackage, DependsOn: []string{"b"}}, {ID: "b", Kind: plan.ActionInstallPackage, DependsOn: []string{"a"}}}}, nil, Options{DryRun: true})
	if err == nil || !strings.Contains(err.Error(), "cycle") {
		t.Fatalf("cycle error = %v", err)
	}
	_, err = Run(context.Background(), plan.InstallPlan{Actions: []plan.PlanAction{{ID: "a", Kind: plan.ActionInstallPackage}}}, nil, Options{})
	if err == nil || !strings.Contains(err.Error(), "no handler") {
		t.Fatalf("handler error = %v", err)
	}
}

func TestFileJournalStoreResumesCompletedActions(t *testing.T) {
	store := FileJournalStore{Dir: t.TempDir()}
	if err := store.Save(context.Background(), Journal{PlanHash: "resume", Entries: []JournalEntry{{ActionID: "install", Status: StatusCompleted}}}); err != nil {
		t.Fatal(err)
	}
	var calls []string
	handler := testHandler{calls: &calls}
	journal, err := Run(context.Background(), plan.InstallPlan{PlanHash: "resume", Actions: []plan.PlanAction{{ID: "install", Kind: plan.ActionInstallPackage}, {ID: "config", Kind: plan.ActionWriteConfig, DependsOn: []string{"install"}}}}, HandlerRegistry{plan.ActionInstallPackage: handler, plan.ActionWriteConfig: handler}, Options{Store: store})
	if err != nil {
		t.Fatal(err)
	}
	if len(journal.Entries) != 2 || len(calls) != 3 {
		t.Fatalf("journal/calls = %#v / %#v", journal, calls)
	}
	if _, err := os.Stat(filepath.Join(store.Dir, "resume.json")); err != nil {
		t.Fatal(err)
	}
}

func TestFileLockRejectsConcurrentRunAndReleases(t *testing.T) {
	path := filepath.Join(t.TempDir(), "install.lock")
	lock := FileLock{Path: path}
	release, err := lock.Acquire(context.Background(), "plan-a")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := lock.Acquire(context.Background(), "plan-b"); err == nil {
		t.Fatal("second lock acquired")
	}
	if err := release(); err != nil {
		t.Fatal(err)
	}
	release, err = lock.Acquire(context.Background(), "plan-c")
	if err != nil {
		t.Fatal(err)
	}
	if err := release(); err != nil {
		t.Fatal(err)
	}
}

type retryHandler struct{ checks int }

func (h *retryHandler) Check(context.Context, plan.PlanAction) (bool, error) {
	h.checks++
	if h.checks < 2 {
		return false, fmt.Errorf("temporary failure")
	}
	return true, nil
}
func (*retryHandler) Apply(context.Context, plan.PlanAction) (ActionResult, error) {
	return ActionResult{}, nil
}
func (*retryHandler) Verify(context.Context, plan.PlanAction, ActionResult) error { return nil }

func TestRunRetriesTransientHandlerFailure(t *testing.T) {
	handler := &retryHandler{}
	journal, err := Run(context.Background(), plan.InstallPlan{Actions: []plan.PlanAction{{ID: "install", Kind: plan.ActionInstallPackage, Retry: plan.RetryPolicy{MaxAttempts: 2}}}}, HandlerRegistry{plan.ActionInstallPackage: handler}, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if handler.checks != 2 || journal.Entries[0].Attempts != 2 || journal.Entries[0].Status != StatusCompleted {
		t.Fatalf("handler/journal = %d / %#v", handler.checks, journal)
	}
}

type rollbackTestHandler struct {
	applied, rolledBack bool
	fail                bool
}

func (h *rollbackTestHandler) Check(context.Context, plan.PlanAction) (bool, error) {
	return false, nil
}
func (h *rollbackTestHandler) Apply(context.Context, plan.PlanAction) (ActionResult, error) {
	if h.fail {
		return ActionResult{}, fmt.Errorf("apply failed")
	}
	h.applied = true
	return ActionResult{}, nil
}
func (h *rollbackTestHandler) Verify(context.Context, plan.PlanAction, ActionResult) error {
	return nil
}
func (h *rollbackTestHandler) Rollback(context.Context, plan.PlanAction, ActionResult) error {
	h.rolledBack = true
	return nil
}

func TestRunRollsBackDeclaredCompletedActionsOnFailure(t *testing.T) {
	first, second := &rollbackTestHandler{}, &rollbackTestHandler{fail: true}
	compiled := plan.InstallPlan{Actions: []plan.PlanAction{
		{ID: "first", Kind: plan.ActionInstallPackage, Rollback: plan.RollbackHandler},
		{ID: "second", Kind: plan.ActionBindProvider, DependsOn: []string{"first"}},
	}}
	_, err := Run(context.Background(), compiled, HandlerRegistry{plan.ActionInstallPackage: first, plan.ActionBindProvider: second}, Options{RollbackOnFailure: true})
	if err == nil || !first.applied || !first.rolledBack {
		t.Fatalf("error/handler = %v / %#v", err, first)
	}
}
