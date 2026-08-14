package cmd

import (
	"errors"
	"strings"

	"github.com/kb-labs/clikit/diag"
	"github.com/kb-labs/create/internal/pm"
)

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
	codeToolchain            = "ERR_TOOLCHAIN"
	codePackageInstall       = "ERR_PACKAGE_INSTALL"
	codeInvalidInput         = "ERR_INVALID_INPUT"
	codeManifest             = "ERR_MANIFEST"
	codePlan                 = "ERR_INSTALL_PLAN"
	codePlatform             = "ERR_PLATFORM"
	codeWrite                = "ERR_INSTALL_WRITE"
	codeDoctor               = "ERR_DOCTOR"
	codeUninstall            = "ERR_UNINSTALL"
	codeLogs                 = "ERR_LOGS"
	codeRecovery             = "ERR_RECOVERY"
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
		codeToolchain:            "install Node.js 24+ and pnpm 11, then run kb-create again",
		codePackageInstall:       "check the registry/channel and package availability; attach the full install log if it persists",
		codeInvalidInput:         "run the command with --help and correct the supplied flags or identifiers",
		codeManifest:             "verify the selected release manifest and retry with a complete published release",
		codePlan:                 "adjust the selected services, plugins, adapters or version/channel so the install plan is valid",
		codePlatform:             "pass --platform <directory> or run from a project already linked to a platform",
		codeWrite:                "check disk space and permissions for the platform directory, then retry",
		codeDoctor:               "run kb-create doctor --fix, then follow any remaining manual fix hints",
		codeUninstall:            "verify the explicit --platform target and filesystem permissions, then retry",
		codeLogs:                 "pass --platform <directory> for an installed platform that contains .kb/logs",
		codeRecovery:             "choose a snapshot ID from <platform>/.kb/v2/snapshots or run kb-create update to create a new recovery point",
	})
}

// classifyError is the sole conversion boundary from implementation errors to
// the public launcher contract. Commands can still return rich Go errors, but
// every human/JSON/agent failure leaves with a stable code, reason and hint.
func classifyError(err error) *diag.Diag {
	var existing *diag.Diag
	if errors.As(err, &existing) {
		return existing
	}
	code := codeUnknown
	message := "KB Labs could not complete the command"
	reason := strings.TrimSpace(err.Error())
	var commandErr *pm.CommandError
	switch {
	case errors.As(err, &commandErr):
		code, message = codePackageInstall, "Package installation failed"
	case strings.Contains(reason, "toolchain preflight") || strings.Contains(reason, "Node.js") || strings.Contains(reason, "pnpm"):
		code, message = codeToolchain, "Required toolchain is not ready"
	case strings.Contains(reason, "unknown plugin") || strings.Contains(reason, "unknown service") || strings.Contains(reason, "--adapters") || strings.Contains(reason, "--platform-"):
		code, message = codeInvalidInput, "The supplied installation input is invalid"
	case strings.Contains(reason, "manifest"):
		code, message = codeManifest, "Release manifest could not be used"
	case strings.Contains(reason, "compile declarative") || strings.Contains(reason, "build declarative") || strings.Contains(reason, "compatibility check"):
		code, message = codePlan, "Installation plan could not be resolved"
	case strings.Contains(reason, "platform directory") || strings.Contains(reason, "platform dir") || strings.Contains(reason, "platform root"):
		code, message = codePlatform, "Platform location could not be resolved"
	case strings.Contains(reason, "write ") || strings.Contains(reason, "create ") || strings.Contains(reason, "finalize"):
		code, message = codeWrite, "Installation state could not be written"
	case strings.Contains(reason, "some checks"):
		code, message = codeDoctor, "Environment checks did not pass"
	case strings.Contains(reason, "remove platform"):
		code, message = codeUninstall, "Platform could not be removed"
	case strings.Contains(reason, "snapshot") || strings.Contains(reason, "rollback"):
		code, message = codeRecovery, "Platform recovery could not be completed"
	case strings.Contains(reason, "install logs") || strings.Contains(reason, "open log"):
		code, message = codeLogs, "Install log could not be read"
	}
	return diag.Wrap(err, code, message, diag.WithReason(reason))
}
