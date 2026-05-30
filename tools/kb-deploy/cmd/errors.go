package cmd

import "github.com/kb-labs/clikit/diag"

// Error codes for kb-deploy, with their default hints and exit codes. Mirrors
// the platform's ERROR_HINTS registry (core/config/src/errors/kb-error.ts).
const (
	codeUnknown       = "ERR_UNKNOWN"
	codeWaveFailed    = "ERR_WAVE_FAILED"
	codeConfigLoad    = "ERR_CONFIG_LOAD"
	codeConfigInvalid = "ERR_CONFIG_INVALID"
	codeHostUndefined = "ERR_HOST_UNDEFINED"
	codeWriteLock     = "ERR_WRITE_LOCK"
)

func init() {
	diag.RegisterHints(map[string]string{
		codeUnknown:       "unexpected failure — re-run with --output=json to see the structured error",
		codeWaveFailed:    "inspect meta.failures for the failing service(s); fix the cause, then re-run `kb-deploy apply` (a rolled-back release is restored automatically)",
		codeConfigLoad:    "check the deploy manifest path (--config) and that it is readable",
		codeConfigInvalid: "the deploy manifest or rendered kb.config.jsonc is invalid — validate its syntax and required fields",
		codeHostUndefined: "the plan references a host with no SSH connection — check hosts[] in deploy.yaml",
		codeWriteLock:     "the apply succeeded but the lock could not be written — check filesystem permissions next to the manifest",
	})
	diag.RegisterExitCodes(map[string]int{
		codeWaveFailed:    diag.ExitConfig, // 2 (overridden to 3 by the rollback path)
		codeConfigLoad:    diag.ExitConfig,
		codeConfigInvalid: diag.ExitConfig,
		codeHostUndefined: diag.ExitConfig,
	})
}
