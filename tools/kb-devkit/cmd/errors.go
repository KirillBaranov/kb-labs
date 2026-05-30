package cmd

import "github.com/kb-labs/clikit/diag"

// Error codes for kb-devkit, with default hints. Mirrors the platform's
// ERROR_HINTS registry (core/config/src/errors/kb-error.ts).
const codeUnknown = "ERR_UNKNOWN"

func init() {
	diag.RegisterHints(map[string]string{
		codeUnknown: "re-run with --output=json to see the structured error",
	})
}
