package result

import (
	"io"

	"github.com/kb-labs/clikit/diag"
	"github.com/kb-labs/clikit/ui"
)

// writeHumanDiag renders a failure for a human: the [ERR ] message, then the
// reason and hint as indented detail lines. This is what makes the launcher
// "say what happened and where to look".
func writeHumanDiag(w io.Writer, d *diag.Diag) {
	if d == nil {
		return
	}
	o := ui.New(w)
	msg := d.Message
	if d.Code != "" {
		msg = d.Code + ": " + d.Message
	}
	o.Err(msg)
	if d.Reason != "" {
		o.Detail("why:  " + d.Reason)
	}
	if d.Hint != "" {
		o.Detail("hint: " + d.Hint)
	}
}

// ResolveMode maps the CLI output flags to a render mode. The canonical
// --output flag wins when set; otherwise the booleans apply (--agent over
// --json); default is human. Lives here (not ui) to avoid an import cycle.
func ResolveMode(jsonFlag, agentFlag bool, outputFlag string) Mode {
	switch normalize(outputFlag) {
	case "json":
		return ModeJSON
	case "agent":
		return ModeAgent
	case "human":
		return ModeHuman
	}
	switch {
	case agentFlag:
		return ModeAgent
	case jsonFlag:
		return ModeJSON
	default:
		return ModeHuman
	}
}

func normalize(s string) string {
	out := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c == ' ' || c == '\t' || c == '\n' {
			continue
		}
		if c >= 'A' && c <= 'Z' {
			c += 'a' - 'A'
		}
		out = append(out, c)
	}
	return string(out)
}
