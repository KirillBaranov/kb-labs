package result

import (
	"encoding/json"
	"fmt"
	"io"

	"github.com/kb-labs/clikit/diag"
)

// Render writes a successful/warning CommandOutput to w in the given mode.
//
//   - ModeHuman: the pre-rendered Human string.
//   - ModeJSON:  the full JSON payload (plus warnings, if any).
//   - ModeAgent: the compact Agent payload, falling back to JSON.
func Render(w io.Writer, out CommandOutput, mode Mode) {
	switch mode {
	case ModeJSON:
		writeJSON(w, jsonEnvelope(out))
	case ModeAgent:
		if out.Agent != nil {
			writeJSON(w, out.Agent)
			return
		}
		writeJSON(w, jsonEnvelope(out))
	default:
		fmt.Fprintln(w, out.Human)
	}
}

// RenderDiag writes a failure (a *Diag) to w in the given mode and returns the
// process exit code. Human mode prints message + reason + hint lines; machine
// modes print the {ok:false, error:{…}} envelope (agent mode omits meta).
func RenderDiag(w io.Writer, hw io.Writer, d *diag.Diag, mode Mode) int {
	switch mode {
	case ModeJSON:
		writeJSON(w, map[string]any{
			"ok":     false,
			"status": string(StatusError),
			"error":  diagPayload(d, true),
		})
	case ModeAgent:
		writeJSON(w, map[string]any{
			"ok":     false,
			"status": string(StatusError),
			"error":  diagPayload(d, false),
		})
	default:
		writeHumanDiag(hw, d)
	}
	return diag.ExitCode(d)
}

// jsonEnvelope is the machine shape for a CommandOutput.
func jsonEnvelope(out CommandOutput) map[string]any {
	env := map[string]any{
		"ok":     out.Ok,
		"status": string(out.Status),
	}
	if out.JSON != nil {
		env["data"] = out.JSON
	}
	if len(out.Warnings) > 0 {
		ws := make([]map[string]any, 0, len(out.Warnings))
		for _, w := range out.Warnings {
			ws = append(ws, diagPayload(w, true))
		}
		env["warnings"] = ws
	}
	return env
}

// diagPayload renders a Diag to a map. withMeta=false yields the compact agent
// form (code/message/reason/hint only).
func diagPayload(d *diag.Diag, withMeta bool) map[string]any {
	if d == nil {
		return nil
	}
	p := map[string]any{
		"code":    d.Code,
		"message": d.Message,
	}
	if d.Reason != "" {
		p["reason"] = d.Reason
	}
	if d.Hint != "" {
		p["hint"] = d.Hint
	}
	if withMeta && len(d.Meta) > 0 {
		p["meta"] = d.Meta
	}
	return p
}

func writeJSON(w io.Writer, v any) {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}
