// Package receipt persists the recovery boundary atomically under .kb/v2.
package receipt

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/kb-labs/create/v2/contracts"
)

func Path(platformRoot string) string {
	return filepath.Join(platformRoot, ".kb", "v2", "receipt.json")
}

func snapshotsDir(platformRoot string) string {
	return filepath.Join(platformRoot, ".kb", "v2", "snapshots")
}
func SnapshotPath(platformRoot, id string) string {
	return filepath.Join(snapshotsDir(platformRoot), id+".json")
}
func Write(platformRoot string, receipt contracts.InstallReceipt) error {
	if receipt.Schema == "" {
		receipt.Schema = contracts.ReceiptSchema
	}
	if receipt.Schema != contracts.ReceiptSchema {
		return fmt.Errorf("unsupported receipt schema %q", receipt.Schema)
	}
	data, err := json.MarshalIndent(receipt, "", "  ")
	if err != nil {
		return err
	}
	path := Path(platformRoot)
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return err
	}
	if err := os.WriteFile(path+".tmp", append(data, '\n'), 0o600); err != nil {
		return err
	}
	return os.Rename(path+".tmp", path)
}

// CreateSnapshot captures only launcher-managed projections. It must run
// before update/uninstall and is intentionally unable to copy arbitrary user
// files from project roots.
func CreateSnapshot(platformRoot string, now time.Time) (contracts.Snapshot, error) {
	current, err := Read(platformRoot)
	if err != nil {
		return contracts.Snapshot{}, fmt.Errorf("read active receipt: %w", err)
	}
	files := map[string][]byte{}
	for _, relative := range []string{".kb/v2/receipt.json", ".kb/v2/bin/kb-dev", ".kb/kb.config.jsonc", ".kb/devservices.yaml", ".kb/install.json", "package.json", "pnpm-lock.yaml"} {
		data, readErr := os.ReadFile(filepath.Join(platformRoot, relative))
		if readErr == nil {
			files[relative] = data
			continue
		}
		if !os.IsNotExist(readErr) {
			return contracts.Snapshot{}, fmt.Errorf("read managed file %s: %w", relative, readErr)
		}
	}
	id := snapshotID(current.ID, now, files)
	snapshot := contracts.Snapshot{Schema: contracts.SnapshotSchema, ID: id, CreatedAt: now.UTC(), ParentID: current.SnapshotID, ReceiptID: current.ID, ArtifactState: current.Plan.PlanHash, ConfigState: current.Verification.ConfigSHA256, Files: files}
	if err := writeSnapshot(platformRoot, snapshot); err != nil {
		return contracts.Snapshot{}, err
	}
	return snapshot, nil
}

func RestoreSnapshot(platformRoot, id string) (contracts.Snapshot, error) {
	data, err := os.ReadFile(SnapshotPath(platformRoot, id))
	if err != nil {
		return contracts.Snapshot{}, err
	}
	var snapshot contracts.Snapshot
	if err := json.Unmarshal(data, &snapshot); err != nil {
		return contracts.Snapshot{}, err
	}
	if snapshot.Schema != contracts.SnapshotSchema || snapshot.ID != id {
		return contracts.Snapshot{}, fmt.Errorf("invalid snapshot %q", id)
	}
	keys := make([]string, 0, len(snapshot.Files))
	for relative := range snapshot.Files {
		keys = append(keys, relative)
	}
	sort.Strings(keys)
	for _, relative := range keys {
		if filepath.IsAbs(relative) || filepath.Clean(relative) != relative || relative == "." || relative == ".." {
			return contracts.Snapshot{}, fmt.Errorf("snapshot contains unsafe managed path %q", relative)
		}
		path := filepath.Join(platformRoot, relative)
		if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
			return contracts.Snapshot{}, err
		}
		if err := os.WriteFile(path, snapshot.Files[relative], 0o600); err != nil {
			return contracts.Snapshot{}, err
		}
	}
	return snapshot, nil
}

func writeSnapshot(platformRoot string, snapshot contracts.Snapshot) error {
	data, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return err
	}
	path := SnapshotPath(platformRoot, snapshot.ID)
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o600)
}

func snapshotID(receiptID string, now time.Time, files map[string][]byte) string {
	h := sha256.New()
	_, _ = h.Write([]byte(receiptID + "\n" + now.UTC().Format(time.RFC3339Nano)))
	keys := make([]string, 0, len(files))
	for key := range files {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		_, _ = h.Write([]byte(key))
		_, _ = h.Write(files[key])
	}
	return fmt.Sprintf("%x", h.Sum(nil))[:24]
}
func Read(platformRoot string) (contracts.InstallReceipt, error) {
	data, err := os.ReadFile(Path(platformRoot))
	if err != nil {
		return contracts.InstallReceipt{}, err
	}
	var result contracts.InstallReceipt
	if err := json.Unmarshal(data, &result); err != nil {
		return contracts.InstallReceipt{}, err
	}
	if result.Schema != contracts.ReceiptSchema {
		return contracts.InstallReceipt{}, fmt.Errorf("unsupported receipt schema %q", result.Schema)
	}
	return result, nil
}

// Delete removes only the active V2 receipt. Snapshots are intentionally kept
// under .kb/v2/snapshots as explicit recovery evidence.
func Delete(platformRoot string) error {
	err := os.Remove(Path(platformRoot))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}
