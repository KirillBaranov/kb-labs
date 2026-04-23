package orchestrator

import (
	"testing"

	"github.com/kb-labs/kb-deploy/internal/config"
)

// stubID produces a stable release id for a service based on pkg + version.
// Real code uses releases.ComputeID; tests don't need its hashing.
func stubID(svc config.Service) string {
	return svc.Service + "@" + svc.Version
}

func twoHostCfg() *config.Config {
	return &config.Config{
		Schema: config.CurrentSchema,
		Services: map[string]config.Service{
			"gateway": {
				Service: "@kb-labs/gateway",
				Version: "1.2.3",
				Targets: config.ServiceTargets{Hosts: []string{"h1", "h2"}},
			},
		},
		Hosts: map[string]config.Host{
			"h1": {}, "h2": {},
		},
	}
}

func TestComputePlan_FreshInstallOnAllHosts(t *testing.T) {
	cfg := twoHostCfg()
	states := map[string]HostState{
		"h1": {Host: "h1", Missing: true},
		"h2": {Host: "h2", Missing: true},
	}
	plan, err := ComputePlan(cfg, states, stubID)
	if err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	if len(plan.Waves) != 1 {
		t.Fatalf("expected 1 wave, got %d", len(plan.Waves))
	}
	if len(plan.Waves[0]) != 2 {
		t.Errorf("expected 2 actions, got %d", len(plan.Waves[0]))
	}
	for _, a := range plan.Waves[0] {
		if a.Kind != ActionInstall {
			t.Errorf("%s: got %s, want install", a.Host, a.Kind)
		}
	}
	if !plan.HasChanges() {
		t.Error("expected HasChanges()")
	}
}

func TestComputePlan_SteadyStateAllSkip(t *testing.T) {
	cfg := twoHostCfg()
	desired := stubID(cfg.Services["gateway"])
	states := map[string]HostState{
		"h1": {Host: "h1", Current: map[string]string{"@kb-labs/gateway": desired}},
		"h2": {Host: "h2", Current: map[string]string{"@kb-labs/gateway": desired}},
	}
	plan, err := ComputePlan(cfg, states, stubID)
	if err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	for _, w := range plan.Waves {
		for _, a := range w {
			if a.Kind != ActionSkip {
				t.Errorf("%s: want skip, got %s", a.Host, a.Kind)
			}
		}
	}
	if plan.HasChanges() {
		t.Error("HasChanges should be false in steady state")
	}
}

func TestComputePlan_CanaryWaveSplit(t *testing.T) {
	cfg := &config.Config{
		Schema: config.CurrentSchema,
		Services: map[string]config.Service{
			"gateway": {
				Service: "@kb-labs/gateway",
				Version: "1.2.3",
				Targets: config.ServiceTargets{
					Hosts:    []string{"h1", "h2", "h3", "h4"},
					Strategy: "canary",
					Waves:    []int{50, 100},
				},
			},
		},
		Hosts: map[string]config.Host{
			"h1": {}, "h2": {}, "h3": {}, "h4": {},
		},
	}
	states := map[string]HostState{
		"h1": {Missing: true}, "h2": {Missing: true},
		"h3": {Missing: true}, "h4": {Missing: true},
	}
	plan, err := ComputePlan(cfg, states, stubID)
	if err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	if len(plan.Waves) != 2 {
		t.Fatalf("expected 2 waves, got %d", len(plan.Waves))
	}
	if len(plan.Waves[0]) != 2 || len(plan.Waves[1]) != 2 {
		t.Errorf("wave sizes = %d, %d; want 2, 2", len(plan.Waves[0]), len(plan.Waves[1]))
	}
}

func TestComputePlan_MultipleServicesMergeByWave(t *testing.T) {
	cfg := &config.Config{
		Schema: config.CurrentSchema,
		Services: map[string]config.Service{
			"gateway": {
				Service: "@kb-labs/gateway", Version: "1.0.0",
				Targets: config.ServiceTargets{Hosts: []string{"h1"}},
			},
			"rest": {
				Service: "@kb-labs/rest-api", Version: "2.0.0",
				Targets: config.ServiceTargets{Hosts: []string{"h1"}},
			},
		},
		Hosts: map[string]config.Host{"h1": {}},
	}
	states := map[string]HostState{"h1": {Missing: true}}
	plan, err := ComputePlan(cfg, states, stubID)
	if err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	if len(plan.Waves) != 1 || len(plan.Waves[0]) != 2 {
		t.Fatalf("expected 1 wave with 2 actions, got %v", plan)
	}
}

func TestSplitWaves_AllStrategy(t *testing.T) {
	actions := []Action{{Host: "h1"}, {Host: "h2"}}
	waves, err := splitWaves(actions, "", nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(waves) != 1 || len(waves[0]) != 2 {
		t.Errorf("want 1 wave × 2, got %v", waves)
	}
}

func TestSplitWaves_Canary50_100(t *testing.T) {
	actions := []Action{{Host: "h1"}, {Host: "h2"}, {Host: "h3"}}
	waves, err := splitWaves(actions, "canary", []int{50, 100})
	if err != nil {
		t.Fatal(err)
	}
	if len(waves) != 2 {
		t.Fatalf("want 2 waves, got %d", len(waves))
	}
	// 50% of 3 hosts = 1.5 → ceil to 2.
	if len(waves[0]) != 2 || len(waves[1]) != 1 {
		t.Errorf("wave sizes = %d,%d; want 2,1", len(waves[0]), len(waves[1]))
	}
}

func TestSplitWaves_InvalidPercents(t *testing.T) {
	actions := []Action{{Host: "h1"}}
	cases := [][]int{
		{50, 40, 100},  // non-monotonic
		{0, 100},       // zero
		{50, 150},      // >100
		{50, 75},       // doesn't reach 100
	}
	for _, p := range cases {
		if _, err := splitWaves(actions, "canary", p); err == nil {
			t.Errorf("expected error for %v", p)
		}
	}
}

func TestSplitWaves_UnknownStrategy(t *testing.T) {
	if _, err := splitWaves([]Action{{}}, "rolling", []int{100}); err == nil {
		t.Error("expected error")
	}
}

func TestPlan_Summary(t *testing.T) {
	p := &Plan{Waves: [][]Action{
		{{Kind: ActionInstall}, {Kind: ActionSkip}},
		{{Kind: ActionSwap}, {Kind: ActionSkip}, {Kind: ActionRestart}},
	}}
	s := p.Summary()
	if s.Install != 1 || s.Swap != 1 || s.Restart != 1 || s.Skip != 2 {
		t.Errorf("summary = %+v", s)
	}
}

func TestComputePlan_HostWithDifferentCurrentReleaseIsInstall(t *testing.T) {
	cfg := twoHostCfg()
	states := map[string]HostState{
		"h1": {Current: map[string]string{"@kb-labs/gateway": "old-id"}},
		"h2": {Missing: true},
	}
	plan, _ := ComputePlan(cfg, states, stubID)
	for _, a := range plan.Waves[0] {
		if a.Kind != ActionInstall {
			t.Errorf("%s: expected install, got %s", a.Host, a.Kind)
		}
	}
}
