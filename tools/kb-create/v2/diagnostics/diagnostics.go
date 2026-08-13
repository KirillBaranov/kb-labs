// Package diagnostics builds redacted, attachable failure dossiers. Raw logs
// remain local; any secret key supplied by the engine is replaced before write.
package diagnostics

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/kb-labs/create/v2/contracts"
)

type Dossier struct {
	CorrelationID string                   `json:"correlationId"`
	Error         *contracts.LauncherError `json:"error"`
	PlanHash      string                   `json:"planHash"`
	Journal       []string                 `json:"journal,omitempty"`
	Logs          []string                 `json:"logs,omitempty"`
}

func Redact(value string, secrets []string) string {
	result := value
	for _, secret := range secrets {
		if secret != "" {
			result = strings.ReplaceAll(result, secret, "[REDACTED]")
		}
	}
	return result
}
func Write(platformRoot string, dossier Dossier, secrets []string) (string, error) {
	for i := range dossier.Journal {
		dossier.Journal[i] = Redact(dossier.Journal[i], secrets)
	}
	for i := range dossier.Logs {
		dossier.Logs[i] = Redact(dossier.Logs[i], secrets)
	}
	data, err := json.MarshalIndent(dossier, "", "  ")
	if err != nil {
		return "", err
	}
	dir := filepath.Join(platformRoot, ".kb", "diagnostics")
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return "", err
	}
	path := filepath.Join(dir, dossier.CorrelationID+".json")
	if err := os.WriteFile(path, append(data, '\n'), 0o600); err != nil {
		return "", err
	}
	return path, nil
}
