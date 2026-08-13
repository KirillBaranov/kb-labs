// Package logs owns V2's local, append-only command transcript. Frontends
// render concise progress while this file preserves enough evidence to attach
// a redacted diagnostic dossier after a failure.
package logs

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type Transcript struct {
	path    string
	file    *os.File
	secrets []string
}

func New(platformRoot, correlationID string, secrets []string) (*Transcript, error) {
	if strings.TrimSpace(correlationID) == "" {
		return nil, fmt.Errorf("log correlation ID is required")
	}
	dir := filepath.Join(platformRoot, ".kb", "logs")
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, err
	}
	file, err := os.OpenFile(filepath.Join(dir, correlationID+".log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, err
	}
	return &Transcript{path: file.Name(), file: file, secrets: append([]string(nil), secrets...)}, nil
}

func (log *Transcript) Path() string { return log.path }

func (log *Transcript) Write(data []byte) (int, error) {
	value := string(data)
	for _, secret := range log.secrets {
		if secret != "" {
			value = strings.ReplaceAll(value, secret, "[REDACTED]")
		}
	}
	if _, err := io.WriteString(log.file, value); err != nil {
		return 0, err
	}
	return len(data), nil
}

func (log *Transcript) Close() error { return log.file.Close() }
