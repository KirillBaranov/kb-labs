package gateway

import "testing"

// TestDefaultPlan verifies the canonical fallback plan covers the standard
// service set and mirrors what scan.GenerateGatewayConfig produces (rest has a
// websocket, workflow strips its prefix, rest aliases widgets + plugins).
func TestDefaultPlan(t *testing.T) {
	p := DefaultPlan()

	for _, id := range []string{"rest", "workflow", "marketplace", "widgets", "plugins"} {
		if _, ok := p.Gateway.Upstreams[id]; !ok {
			t.Errorf("DefaultPlan missing upstream %q", id)
		}
	}
	if !p.Gateway.Upstreams["rest"].WebSocket {
		t.Error("rest upstream should enable websocket")
	}
	wf := p.Gateway.Upstreams["workflow"]
	if wf.RewritePrefix == nil || *wf.RewritePrefix != "" {
		t.Errorf("workflow rewritePrefix = %v, want pointer to empty string", wf.RewritePrefix)
	}
	if p.Gateway.Upstreams["widgets"].ServiceID != "rest" {
		t.Error("widgets must proxy to the rest service")
	}

	for id, want := range map[string]string{
		"rest":        "http://127.0.0.1:5050",
		"workflow":    "http://127.0.0.1:7778",
		"marketplace": "http://127.0.0.1:5070",
	} {
		if got := p.Transport[id].URL; got != want {
			t.Errorf("transport %q URL = %q, want %q", id, got, want)
		}
	}
}
