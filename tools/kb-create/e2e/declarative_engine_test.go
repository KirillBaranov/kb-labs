package e2e

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDeclarativeEngineScenarioDiscoveryInspectPlanAndPlanOnlyApply(t *testing.T) {
	bin := binary(t)
	fixture := filepath.Join("..", "internal", "engine", "catalog", "testdata", "commit-package")
	out, code := run(t, bin, "agent", "scenarios")
	if code != 0 {
		t.Fatalf("agent scenarios exited %d:\n%s", code, out)
	}
	var catalog struct {
		OK        bool `json:"ok"`
		Scenarios []struct {
			ID string `json:"id"`
		} `json:"scenarios"`
	}
	if err := json.Unmarshal([]byte(out), &catalog); err != nil {
		t.Fatalf("scenarios JSON: %v\n%s", err, out)
	}
	if !catalog.OK || len(catalog.Scenarios) < 4 {
		t.Fatalf("scenario catalog = %#v", catalog)
	}

	out, code = run(t, bin, "agent", "inspect", "--scenario", "commit", "--package-dir", fixture)
	if code != 0 {
		t.Fatalf("agent inspect exited %d:\n%s", code, out)
	}
	var inspect struct {
		OK     bool `json:"ok"`
		Screen struct {
			ID       string `json:"id"`
			Sections []any  `json:"sections"`
		} `json:"screen"`
	}
	if err := json.Unmarshal([]byte(out), &inspect); err != nil {
		t.Fatalf("inspect JSON: %v\n%s", err, out)
	}
	if !inspect.OK || inspect.Screen.ID != "providers" || len(inspect.Screen.Sections) == 0 {
		t.Fatalf("inspect = %#v", inspect)
	}

	platform, project := t.TempDir(), t.TempDir()
	out, code = run(t, bin, "agent", "plan", "--scenario", "commit", "--project-root", project, "--platform-root", platform, "--package-dir", fixture)
	if code != 0 {
		t.Fatalf("agent plan exited %d:\n%s", code, out)
	}
	var planResponse struct {
		OK   bool `json:"ok"`
		Plan struct {
			Source   string `json:"source"`
			PlanHash string `json:"planHash"`
		} `json:"plan"`
	}
	if err := json.Unmarshal([]byte(out), &planResponse); err != nil {
		t.Fatalf("plan JSON: %v\n%s", err, out)
	}
	if !planResponse.OK || planResponse.Plan.Source != "scenario" || planResponse.Plan.PlanHash == "" {
		t.Fatalf("plan = %#v", planResponse)
	}

	out, code = run(t, bin, "agent", "apply", "--scenario", "commit", "--project-root", project, "--platform-root", platform, "--plan-only", "--package-dir", fixture)
	if code != 0 {
		t.Fatalf("agent plan-only apply exited %d:\n%s", code, out)
	}
	if !strings.Contains(out, `"status":"planned"`) {
		t.Fatalf("plan-only response missing planned actions:\n%s", out)
	}
	if _, err := os.Stat(filepath.Join(platform, ".kb")); !os.IsNotExist(err) {
		t.Fatalf("plan-only mutated platform root: %v", err)
	}
}
