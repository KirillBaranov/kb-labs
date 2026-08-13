package doctor

import (
	"errors"
	"testing"

	"github.com/kb-labs/create/v2/contracts"
)

func TestRepairPlanNeverAutoFixesSecretInput(t *testing.T) {
	findings := Diagnose([]Manifest{{ID: "plugin", Requirements: []Requirement{{Path: "/plugin/mode", Required: true, Default: []byte(`"safe"`)}, {Path: "/plugin/token", Secret: true, Required: true, Hint: "set token"}}}}, map[string]bool{})
	plan := PlanRepair(findings)
	if len(plan.SafeDefaults) != 1 || len(plan.RequiredInput) != 1 || plan.RequiredInput[0].Code != contracts.CodeInputRequired {
		t.Fatalf("plan = %#v", plan)
	}
	called := 0
	if err := ApplySafe(plan, func(Finding) error { called++; return nil }); err != nil || called != 1 {
		t.Fatalf("err/called = %v / %d", err, called)
	}
}

func TestApplySafeStopsAtFirstFailure(t *testing.T) {
	plan := RepairPlan{SafeDefaults: []Finding{{Path: "/one"}, {Path: "/two"}}}
	called := 0
	err := ApplySafe(plan, func(Finding) error { called++; return errors.New("write failed") })
	if err == nil || called != 1 {
		t.Fatalf("err/called = %v / %d", err, called)
	}
}
