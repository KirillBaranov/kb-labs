package cmd

import "github.com/kb-labs/clikit/diag"

// Error/warning codes for kb-create, with default hints. Mirrors the platform's
// ERROR_HINTS registry (core/config/src/errors/kb-error.ts). Some sites also set
// an explicit hint; the registry entry is the fallback.
const (
	codeUnknown         = "ERR_UNKNOWN"
	codeManifestMissing = "ERR_MANIFEST_MISSING"
	codeProjectDetect   = "ERR_PROJECT_DETECT"
)

func init() {
	diag.RegisterHints(map[string]string{
		codeUnknown:         "re-run with --output=json to see the structured error",
		codeManifestMissing: "add dist/manifest.json to the service package, or register the service in .kb/devservices.yaml manually",
		codeProjectDetect:   "project type could not be detected — pass an explicit target or check the directory contents",
	})
}
