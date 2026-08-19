package integration

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/kb-labs/create/internal/engine/bootstrap"
	"github.com/kb-labs/create/internal/engine/flow"
	"github.com/kb-labs/create/internal/engine/plan"
	"github.com/kb-labs/create/internal/engine/scenario"
)

// TestExploreScenario_CompilesGatewayRoutesFromRealCatalog is the
// compile-time half of the engine-unification conformance check (see
// docs/plans/2026-08-19-kb-create-engine-unification-implementation.md §12):
// with the real embedded manifest.json (not a synthetic test catalog), the
// "explore" scenario's compiled plan must carry a discover:services action
// whose gatewayRoutesJSON input has the same prefix/rewrite/websocket data
// scaffold.go's legacy renderer got from the manifest — the part of gateway
// routing this engine resolves statically at compile time. The dynamic part
// (each service's actual port, read from its own installed manifest) is
// covered separately by TestDiscoveryHandler_WritesRealScanOutput in
// internal/engine/handlers, which exercises a real scan.Run against a fake
// installed package.
func TestExploreScenario_CompilesGatewayRoutesFromRealCatalog(t *testing.T) {
	cat, err := bootstrap.DefaultCatalog()
	if err != nil {
		t.Fatalf("bootstrap.DefaultCatalog() error = %v", err)
	}
	loaded, err := scenario.Load("explore")
	if err != nil {
		t.Fatalf("scenario.Load(explore) error = %v", err)
	}
	state, err := flow.New(loaded)
	if err != nil {
		t.Fatalf("flow.New() error = %v", err)
	}
	state.Done = true
	request, err := flow.BuildInstallRequest(loaded, state, "/tmp/project", "/tmp/platform", cat.Digest)
	if err != nil {
		t.Fatalf("flow.BuildInstallRequest() error = %v", err)
	}
	compiled, err := plan.Compile(request, cat)
	if err != nil {
		t.Fatalf("plan.Compile() error = %v", err)
	}

	var discover *plan.PlanAction
	for i := range compiled.Actions {
		if compiled.Actions[i].Kind == plan.ActionDiscoverServices {
			discover = &compiled.Actions[i]
		}
	}
	if discover == nil {
		t.Fatal("compiled plan has no discover:services action")
	}
	routesJSON := discover.Inputs["gatewayRoutesJSON"]
	if routesJSON == "" {
		t.Fatal("discover:services has no gatewayRoutesJSON — explore selects rest/workflow/marketplace, all gateway-routed")
	}
	var routes map[string]plan.GatewayRouteInfo
	if err := json.Unmarshal([]byte(routesJSON), &routes); err != nil {
		t.Fatalf("gatewayRoutesJSON is not valid JSON: %v\n%s", err, routesJSON)
	}
	want := map[string]struct {
		prefix    string
		websocket bool
		rewrite   bool // true = expect a non-nil Rewrite pointer
	}{
		"rest":        {prefix: "/api/v1", websocket: true},
		"workflow":    {prefix: "/api/exec", rewrite: true},
		"marketplace": {prefix: "/api/v1/marketplace"},
	}
	for id, expect := range want {
		route, ok := routes[id]
		if !ok {
			t.Errorf("gatewayRoutesJSON missing route for %q, got %#v", id, routes)
			continue
		}
		if route.Prefix != expect.prefix {
			t.Errorf("%s.prefix = %q, want %q", id, route.Prefix, expect.prefix)
		}
		if route.WebSocket != expect.websocket {
			t.Errorf("%s.websocket = %v, want %v", id, route.WebSocket, expect.websocket)
		}
		if expect.rewrite && route.Rewrite == nil {
			t.Errorf("%s.rewrite = nil, want a non-nil rewrite prefix (workflow strips its prefix)", id)
		}
	}
	// "gateway" and "studio" are selected but not gateway-routed themselves
	// (gateway IS the gateway; studio is served by rest's upstream) — they
	// must not appear as their own route.
	for _, id := range []string{"gateway", "studio"} {
		if _, ok := routes[id]; ok {
			t.Errorf("%q should not have its own gateway route, got %#v", id, routes[id])
		}
	}

	// The bootstrap secret (task #8) must be wired for explore's default
	// secured access mode.
	foundSecret := false
	for _, s := range compiled.Assembly.Secrets {
		if s.EnvVar == "GATEWAY_BOOTSTRAP_ADMIN_PASSWORD" {
			foundSecret = true
		}
	}
	if !foundSecret {
		t.Error("explore scenario's default (secured) access mode must request the gateway bootstrap secret")
	}

	// Sanity: explore's default access.mode is "secured", so the gateway
	// auth patches (task #7) must be present with the bootstrap block.
	foundBootstrap := false
	for _, p := range compiled.Assembly.Patches {
		if strings.HasPrefix(p.Path, "/gateway/auth/bootstrap/") {
			foundBootstrap = true
		}
	}
	if !foundBootstrap {
		t.Error("explore scenario must carry gateway/auth/bootstrap/* patches (gateway.access.secured effect)")
	}
}
