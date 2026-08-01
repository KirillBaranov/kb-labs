package cmd

import "github.com/kb-labs/clikit/diag"

// Error/warning codes for kb-create, with default hints. Mirrors the platform's
// ERROR_HINTS registry (core/config/src/errors/kb-error.ts). Some sites also set
// an explicit hint; the registry entry is the fallback.
const (
	codeUnknown              = "ERR_UNKNOWN"
	codeManifestMissing      = "ERR_MANIFEST_MISSING"
	codeProjectDetect        = "ERR_PROJECT_DETECT"
	codeDevservicesLoad      = "ERR_DEVSERVICES_LOAD"
	codeDevservicesWrite     = "ERR_DEVSERVICES_WRITE"
	codeDeployMatrixMissing  = "DEPLOY_MATRIX_MISSING"
	codeDeployIncompatible   = "DEPLOY_VERSION_INCOMPATIBLE"
	codeDeployLockInvalid    = "DEPLOY_LOCK_INVALID"
	codeDeployPackageInstall = "DEPLOY_PACKAGE_INSTALL_FAILED"
	codeDeployConfigInvalid  = "DEPLOY_CONFIG_INVALID"
)

func init() {
	diag.RegisterHints(map[string]string{
		codeUnknown:              "re-run with --output=json to see the structured error",
		codeManifestMissing:      "add dist/manifest.json to the service package, or register the service in .kb/devservices.yaml manually",
		codeProjectDetect:        "project type could not be detected — pass an explicit target or check the directory contents",
		codeDevservicesLoad:      "check that <platform>/.kb/devservices.yaml exists and is valid YAML",
		codeDevservicesWrite:     "check filesystem permissions on <platform>/.kb/",
		codeDeployMatrixMissing:  "use a release image that contains .kb/compatibility.json, or pass --matrix <release-matrix.json>",
		codeDeployIncompatible:   "choose a base image in the required release range, or re-export from a compatible local platform",
		codeDeployLockInvalid:    "re-run kb-create deployment export from a complete local installation; do not edit package versions by hand",
		codeDeployPackageInstall: "check registry credentials and package availability, then rebuild; the target image is unchanged until provision succeeds",
		codeDeployConfigInvalid:  "fix the exported kb.config.jsonc and run kb-create deployment export again",
	})
}
