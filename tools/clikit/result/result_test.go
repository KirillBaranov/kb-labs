package result

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/kb-labs/clikit/diag"
)

func TestSuccess_Shape(t *testing.T) {
	o := Success("done", map[string]any{"n": 1})
	if !o.Ok || o.Status != StatusSuccess || o.Human != "done" {
		t.Errorf("Success shape = %+v", o)
	}
}

// WithWarnings is exercised in production (reconcile_devservices) but was
// previously untested. It must: collect warnings, skip nils, and downgrade a
// success to "warning" — without touching a non-success status.
func TestWithWarnings_DowngradesSuccessToWarning(t *testing.T) {
	o := Success("ok", nil).WithWarnings(diag.New("ERR_DEP_PRUNED", "pruned dep"))
	if o.Status != StatusWarning {
		t.Errorf("status = %q, want warning", o.Status)
	}
	if len(o.Warnings) != 1 {
		t.Fatalf("warnings = %d, want 1", len(o.Warnings))
	}
}

func TestWithWarnings_SkipsNil(t *testing.T) {
	o := Success("ok", nil).WithWarnings(nil, diag.New("ERR_W", "w"), nil)
	if len(o.Warnings) != 1 {
		t.Errorf("warnings = %d, want 1 (nils skipped)", len(o.Warnings))
	}
}

func TestWithWarnings_NoWarningsKeepsSuccess(t *testing.T) {
	o := Success("ok", nil).WithWarnings()
	if o.Status != StatusSuccess {
		t.Errorf("status = %q, want unchanged success", o.Status)
	}
}

func TestWithWarnings_DoesNotDowngradeNonSuccess(t *testing.T) {
	// A command that already failed keeps its status even with warnings.
	o := CommandOutput{Ok: false, Status: StatusError}.WithWarnings(diag.New("ERR_W", "w"))
	if o.Status != StatusError {
		t.Errorf("status = %q, want error preserved", o.Status)
	}
}

// The full JSON envelope must surface warnings (with meta) so a machine caller
// sees what was non-fatally dropped.
func TestRender_JSONIncludesWarnings(t *testing.T) {
	o := Success("ok", nil).WithWarnings(
		diag.New("ERR_DEP_PRUNED", "pruned", diag.WithMeta(map[string]any{"dep": "redis"})),
	)
	var b bytes.Buffer
	Render(&b, o, ModeJSON)

	var env map[string]any
	if err := json.Unmarshal(b.Bytes(), &env); err != nil {
		t.Fatalf("not json: %v", err)
	}
	if env["status"] != "warning" {
		t.Errorf("status = %v, want warning", env["status"])
	}
	ws, ok := env["warnings"].([]any)
	if !ok || len(ws) != 1 {
		t.Fatalf("warnings = %v", env["warnings"])
	}
	w0 := ws[0].(map[string]any)
	if w0["code"] != "ERR_DEP_PRUNED" {
		t.Errorf("warning code = %v", w0["code"])
	}
	if _, ok := w0["meta"]; !ok {
		t.Error("JSON warnings should carry meta")
	}
}

// The explicit-Agent branch (out.Agent != nil) — distinct from the
// fall-back-to-JSON path the existing test covers.
func TestRender_AgentUsesExplicitPayload(t *testing.T) {
	o := Success("h", map[string]any{"full": true})
	o.Agent = map[string]any{"compact": "yes"}
	var b bytes.Buffer
	Render(&b, o, ModeAgent)

	if !strings.Contains(b.String(), `"compact"`) {
		t.Errorf("agent output should use explicit Agent payload, got %q", b.String())
	}
	if strings.Contains(b.String(), "full") {
		t.Errorf("agent output must not leak the JSON payload, got %q", b.String())
	}
}

// Success with no JSON payload must omit "data" rather than emit null.
func TestRender_JSONOmitsDataWhenNil(t *testing.T) {
	var b bytes.Buffer
	Render(&b, Success("h", nil), ModeJSON)
	if strings.Contains(b.String(), "data") {
		t.Errorf("envelope should omit data when JSON is nil, got %q", b.String())
	}
}

// The error path must tolerate a nil *Diag (a typed-nil error reaching the
// renderer) — no panic, exit OK, empty render.
func TestRenderDiag_NilIsSafe(t *testing.T) {
	for _, mode := range []Mode{ModeHuman, ModeJSON, ModeAgent} {
		var out, herr bytes.Buffer
		if code := RenderDiag(&out, &herr, nil, mode); code != diag.ExitOK {
			t.Errorf("mode %d: nil diag exit = %d, want %d", mode, code, diag.ExitOK)
		}
	}
}

func TestRenderDiag_AgentExitCodeIsResolved(t *testing.T) {
	diag.RegisterExitCodes(map[string]int{"ERR_CFG_RENDER": diag.ExitConfig})
	d := diag.New("ERR_CFG_RENDER", "bad config")
	var out, herr bytes.Buffer
	if code := RenderDiag(&out, &herr, d, ModeAgent); code != diag.ExitConfig {
		t.Errorf("agent RenderDiag exit = %d, want %d", code, diag.ExitConfig)
	}
}

// --output is normalized: surrounding whitespace and case must not matter.
func TestResolveMode_NormalizesOutputFlag(t *testing.T) {
	cases := []struct {
		out  string
		want Mode
	}{
		{"  JSON ", ModeJSON},
		{"Agent", ModeAgent},
		{"\tHUMAN\n", ModeHuman},
		{"garbage", ModeHuman}, // unknown → falls through to flag/default
	}
	for _, c := range cases {
		if got := ResolveMode(false, false, c.out); got != c.want {
			t.Errorf("ResolveMode(out=%q) = %d, want %d", c.out, got, c.want)
		}
	}
}
