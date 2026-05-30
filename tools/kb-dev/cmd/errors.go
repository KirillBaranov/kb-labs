package cmd

import "github.com/kb-labs/clikit/diag"

// Error codes for kb-dev, with default hints. Mirrors the platform's
// ERROR_HINTS registry (core/config/src/errors/kb-error.ts).
const (
	codeUnknown        = "ERR_UNKNOWN"
	codeConfigNotFound = "ERR_CONFIG_NOT_FOUND"
)

func init() {
	diag.RegisterHints(map[string]string{
		codeUnknown:        "re-run with --output=json to see the structured error",
		codeConfigNotFound: "no .kb/devservices.yaml found — run from a project dir or pass --config",
	})
	diag.RegisterExitCodes(map[string]int{
		codeConfigNotFound: diag.ExitConfig,
	})
}
