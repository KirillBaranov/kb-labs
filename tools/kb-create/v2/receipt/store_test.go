package receipt

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/kb-labs/create/v2/contracts"
)

func TestSnapshotRestoresManagedFilesWithoutTouchingProjectFiles(t *testing.T) {
	root := t.TempDir()
	if err := Write(root, contracts.InstallReceipt{Schema: contracts.ReceiptSchema, ID: "receipt-1", Plan: contracts.ResolvedInstallPlan{PlanHash: "plan"}, Verification: contracts.Verification{ConfigSHA256: "config"}}); err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(root, ".kb", "kb.config.jsonc")
	if err := os.WriteFile(config, []byte("before"), 0o600); err != nil {
		t.Fatal(err)
	}
	userFile := filepath.Join(root, "user.txt")
	if err := os.WriteFile(userFile, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	snapshot, err := CreateSnapshot(root, time.Unix(1, 0))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(config, []byte("after"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := Write(root, contracts.InstallReceipt{Schema: contracts.ReceiptSchema, ID: "receipt-2"}); err != nil {
		t.Fatal(err)
	}
	if _, err := RestoreSnapshot(root, snapshot.ID); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(config); string(data) != "before" {
		t.Fatalf("config = %q", data)
	}
	if data, _ := os.ReadFile(userFile); string(data) != "keep" {
		t.Fatalf("user file = %q", data)
	}
	restored, err := Read(root)
	if err != nil || restored.ID != "receipt-1" {
		t.Fatalf("receipt = %#v, %v", restored, err)
	}
}
