package result

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/kb-labs/clikit/diag"
)

func TestRender_Human(t *testing.T) {
	var b bytes.Buffer
	Render(&b, Success("hello human", map[string]any{"x": 1}), ModeHuman)
	if got := strings.TrimSpace(b.String()); got != "hello human" {
		t.Errorf("human = %q", got)
	}
}

func TestRender_JSON(t *testing.T) {
	var b bytes.Buffer
	Render(&b, Success("ignored", map[string]any{"x": 1}), ModeJSON)
	var env map[string]any
	if err := json.Unmarshal(b.Bytes(), &env); err != nil {
		t.Fatalf("not json: %v", err)
	}
	if env["ok"] != true || env["status"] != "success" {
		t.Errorf("envelope = %v", env)
	}
	data, _ := env["data"].(map[string]any)
	if data["x"].(float64) != 1 {
		t.Errorf("data = %v", env["data"])
	}
}

func TestRender_AgentFallsBackToJSON(t *testing.T) {
	var b bytes.Buffer
	// No Agent payload set → agent mode uses the JSON envelope.
	Render(&b, Success("h", map[string]any{"x": 1}), ModeAgent)
	if !strings.Contains(b.String(), `"status": "success"`) {
		t.Errorf("agent fallback = %q", b.String())
	}
}

func TestRenderDiag_JSONHasFullErrorEnvelope(t *testing.T) {
	d := diag.New("ERR_WAVE_FAILED", "wave 1 failed",
		diag.WithReason("health gate timed out"),
		diag.WithHint("see meta.failures"),
		diag.WithMeta(map[string]any{"wave": 1}))
	var out, herr bytes.Buffer
	code := RenderDiag(&out, &herr, d, ModeJSON)
	if code != diag.ExitError {
		t.Errorf("exit = %d", code)
	}
	var env map[string]any
	if err := json.Unmarshal(out.Bytes(), &env); err != nil {
		t.Fatalf("not json: %v", err)
	}
	if env["ok"] != false {
		t.Errorf("ok = %v", env["ok"])
	}
	e := env["error"].(map[string]any)
	if e["code"] != "ERR_WAVE_FAILED" || e["reason"] != "health gate timed out" || e["hint"] != "see meta.failures" {
		t.Errorf("error payload = %v", e)
	}
	if _, ok := e["meta"]; !ok {
		t.Error("json mode should include meta")
	}
}

func TestRenderDiag_AgentOmitsMeta(t *testing.T) {
	d := diag.New("ERR_X", "x", diag.WithMeta(map[string]any{"big": "blob"}))
	var out, herr bytes.Buffer
	RenderDiag(&out, &herr, d, ModeAgent)
	if strings.Contains(out.String(), "big") {
		t.Errorf("agent mode must omit meta, got %q", out.String())
	}
}

func TestRenderDiag_HumanShowsReasonAndHint(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	d := diag.New("ERR_MANIFEST_MISSING", "service gateway has no manifest",
		diag.WithReason("shipped without a service manifest"),
		diag.WithHint("add dist/manifest.json"))
	var out, herr bytes.Buffer
	RenderDiag(&out, &herr, d, ModeHuman)
	h := herr.String()
	for _, want := range []string{"ERR_MANIFEST_MISSING", "why:", "shipped without", "hint:", "add dist/manifest.json"} {
		if !strings.Contains(h, want) {
			t.Errorf("human diag missing %q in:\n%s", want, h)
		}
	}
}

func TestResolveMode(t *testing.T) {
	cases := []struct {
		j, a bool
		out  string
		want Mode
	}{
		{false, false, "", ModeHuman},
		{true, false, "", ModeJSON},
		{false, true, "", ModeAgent},
		{true, false, "agent", ModeAgent}, // --output wins
		{true, true, "human", ModeHuman},  // --output wins
		{false, false, "json", ModeJSON},
	}
	for _, c := range cases {
		if got := ResolveMode(c.j, c.a, c.out); got != c.want {
			t.Errorf("ResolveMode(%v,%v,%q) = %d, want %d", c.j, c.a, c.out, got, c.want)
		}
	}
}
