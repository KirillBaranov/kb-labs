package diagnostics

import (
	"os"
	"strings"
	"testing"

	"github.com/kb-labs/create/v2/contracts"
)

func TestWriteRedactsEveryAttachableField(t *testing.T) {
	root := t.TempDir()
	path, err := Write(root, Dossier{CorrelationID: "c1", Stage: contracts.StageApply, Error: &contracts.LauncherError{Cause: "token=secret", Details: map[string]string{"registry": "https://secret@registry"}}, Journal: []string{"secret"}, Logs: []string{"key secret"}}, []string{"secret"})
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "secret") || !strings.Contains(string(data), "[REDACTED]") {
		t.Fatalf("dossier leaked secret: %s", data)
	}
}

func TestWriteRequiresCorrelationID(t *testing.T) {
	if _, err := Write(t.TempDir(), Dossier{}, nil); err == nil {
		t.Fatal("expected correlation validation")
	}
}
