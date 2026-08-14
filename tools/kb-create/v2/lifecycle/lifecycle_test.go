package lifecycle

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/kb-labs/create/v2/contracts"
	"github.com/kb-labs/create/v2/receipt"
)

func TestMutateRestoresReceiptAndConfigWhenVerificationFails(t *testing.T) {
	root := t.TempDir()
	if err := receipt.Write(root, contracts.InstallReceipt{Schema: contracts.ReceiptSchema, ID: "before"}); err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(root, ".kb", "kb.config.jsonc")
	if err := os.WriteFile(config, []byte("before"), 0o600); err != nil {
		t.Fatal(err)
	}
	packageRestored := false
	snapshot, err := Mutate(root, time.Unix(2, 0), func() error { return os.WriteFile(config, []byte("after"), 0o600) }, func() error { return errors.New("readiness failed") }, func() error { packageRestored = true; return nil })
	if err == nil || !strings.Contains(err.Error(), "restored snapshot "+snapshot.ID) {
		t.Fatalf("err = %v", err)
	}
	if data, _ := os.ReadFile(config); string(data) != "before" {
		t.Fatalf("config = %q", data)
	}
	if !packageRestored {
		t.Fatal("package restore was not invoked")
	}
	active, readErr := receipt.Read(root)
	if readErr != nil || active.ID != "before" {
		t.Fatalf("receipt = %#v, %v", active, readErr)
	}
}

func TestRollbackRestoresNamedSnapshot(t *testing.T) {
	root := t.TempDir()
	if err := receipt.Write(root, contracts.InstallReceipt{Schema: contracts.ReceiptSchema, ID: "before"}); err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(root, ".kb", "kb.config.jsonc")
	if err := os.WriteFile(config, []byte("before"), 0o600); err != nil {
		t.Fatal(err)
	}
	snapshot, err := receipt.CreateSnapshot(root, time.Unix(3, 0))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(config, []byte("after"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Rollback(root, snapshot.ID, nil); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(config); string(data) != "before" {
		t.Fatalf("config = %q", data)
	}
}
