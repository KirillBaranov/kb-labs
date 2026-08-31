package contracts

import (
	"errors"
	"fmt"
)

type ErrorStage string

const (
	StageResolve ErrorStage = "resolve"
	StageApply   ErrorStage = "apply"
	StageVerify  ErrorStage = "verify"
	StageRecover ErrorStage = "recover"
)

const (
	CodeIncompatibleComponents = "KB_CREATE_INCOMPATIBLE_COMPONENTS"
	CodeProviderUnresolved     = "KB_CREATE_PROVIDER_UNRESOLVED"
	CodeProviderAmbiguous      = "KB_CREATE_PROVIDER_AMBIGUOUS"
	CodeInputRequired          = "KB_CREATE_INPUT_REQUIRED"
	CodeConfigRequired         = "KB_CREATE_CONFIG_REQUIRED"
	CodeArtifactMismatch       = "KB_CREATE_ARTIFACT_MANIFEST_MISMATCH"
	CodeServiceGraphMismatch   = "KB_CREATE_SERVICE_GRAPH_MISMATCH"
)

// Remote release-resolution diagnostics. Callers branch on these codes through
// CodeOf; none of them is ever recognised by matching error text.
const (
	CodeReleaseChannelAbsent         = "KB_CREATE_RELEASE_CHANNEL_ABSENT"
	CodeReleaseDescriptorUnavailable = "KB_CREATE_RELEASE_DESCRIPTOR_UNAVAILABLE"
	CodeReleaseDigestMismatch        = "KB_CREATE_RELEASE_DIGEST_MISMATCH"
	CodeReleaseSchemaUnsupported     = "KB_CREATE_RELEASE_SCHEMA_UNSUPPORTED"
	CodeReleaseGraphNodeUnknown      = "KB_CREATE_RELEASE_GRAPH_NODE_UNKNOWN"
	CodeReleaseGraphEdgeMissing      = "KB_CREATE_RELEASE_GRAPH_EDGE_MISSING"
	CodeReleaseTargetUnsupported     = "KB_CREATE_RELEASE_TARGET_UNSUPPORTED"
	CodeArtifactChecksumMismatch     = "KB_CREATE_ARTIFACT_CHECKSUM_MISMATCH"
	CodeReleaseIndexInvalid          = "KB_CREATE_RELEASE_INDEX_INVALID"
	CodeReceiptInvalid               = "KB_CREATE_RECEIPT_INVALID"
	CodeSupportPolicyUnavailable     = "KB_CREATE_SUPPORT_POLICY_UNAVAILABLE"
	CodeToolchainUnsupported         = "KB_CREATE_TOOLCHAIN_UNSUPPORTED"
)

// ReleaseError builds the typed launcher error for a release-resolution
// failure. Cause is a message, never a wrapped secret-bearing value.
func ReleaseError(code string, stage ErrorStage, message, hint string, cause error) *LauncherError {
	value := &LauncherError{Code: code, Stage: stage, Message: message, Hint: hint}
	if cause != nil {
		value.Cause = cause.Error()
	}
	return value
}

// WithDetail attaches non-secret structured context, such as the release ID or
// the unsupported target that produced the failure.
func (e *LauncherError) WithDetail(key, value string) *LauncherError {
	if e == nil || value == "" {
		return e
	}
	if e.Details == nil {
		e.Details = map[string]string{}
	}
	e.Details[key] = value
	return e
}

// CodeOf extracts the typed diagnostic code from any error in the chain.
// It exists so callers never have to substring-match an error message.
func CodeOf(err error) string {
	var launcher *LauncherError
	if errors.As(err, &launcher) {
		return launcher.Code
	}
	return ""
}

// Unwrap keeps a LauncherError usable as a wrapper in errors.Is/As chains.
func (e *LauncherError) Unwrap() error {
	if e == nil || e.Cause == "" {
		return nil
	}
	return errors.New(e.Cause)
}

// LauncherError is safe to render for a human, return in JSON/agent protocol
// and persist in a redacted diagnostic dossier. Cause must never hold secrets.
type LauncherError struct {
	Code          string            `json:"code"`
	Stage         ErrorStage        `json:"stage"`
	Retryable     bool              `json:"retryable"`
	Message       string            `json:"message"`
	Cause         string            `json:"cause,omitempty"`
	Hint          string            `json:"hint"`
	CorrelationID string            `json:"correlationId"`
	Details       map[string]string `json:"details,omitempty"`
}

func (e *LauncherError) Error() string {
	if e == nil {
		return "<nil>"
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}
