// Package result is the dual human/machine output envelope for the KB Labs Go
// launcher tools. It mirrors the platform's CommandOutput
// (shared/cli-ui/src/command-result.ts): a single command outcome that can be
// rendered as pretty human text, full JSON, or a compact agent payload.
package result

import "github.com/kb-labs/clikit/diag"

// Status mirrors the platform CommandOutput status union.
type Status string

const (
	StatusSuccess   Status = "success"
	StatusError     Status = "error"
	StatusWarning   Status = "warning"
	StatusInfo      Status = "info"
	StatusFailed    Status = "failed"
	StatusCancelled Status = "cancelled"
	StatusSkipped   Status = "skipped"
)

// Mode selects how a CommandOutput / Diag is rendered.
type Mode int

const (
	ModeHuman Mode = iota
	ModeJSON
	ModeAgent
)

// CommandOutput is one command's outcome in all renderable forms.
//
//   - Human is the pre-rendered pretty string (built with the ui package).
//   - JSON is the full machine payload (any JSON-marshalable value).
//   - Agent is an optional compact payload for agents; when nil, agent mode
//     falls back to JSON.
type CommandOutput struct {
	Ok       bool         `json:"ok"`
	Status   Status       `json:"status"`
	Human    string       `json:"-"`
	JSON     any          `json:"json,omitempty"`
	Agent    any          `json:"agent,omitempty"`
	Warnings []*diag.Diag `json:"warnings,omitempty"`
}

// Success builds a successful CommandOutput.
func Success(human string, jsonPayload any) CommandOutput {
	return CommandOutput{Ok: true, Status: StatusSuccess, Human: human, JSON: jsonPayload}
}

// WithWarnings attaches non-fatal diagnostics and downgrades the status to
// warning when the command otherwise succeeded.
func (o CommandOutput) WithWarnings(ws ...*diag.Diag) CommandOutput {
	for _, w := range ws {
		if w != nil {
			o.Warnings = append(o.Warnings, w)
		}
	}
	if o.Ok && len(o.Warnings) > 0 && o.Status == StatusSuccess {
		o.Status = StatusWarning
	}
	return o
}
