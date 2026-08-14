package contracts

import "fmt"

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
