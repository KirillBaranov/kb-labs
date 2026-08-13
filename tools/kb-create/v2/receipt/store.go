// Package receipt persists the recovery boundary atomically under .kb/v2.
package receipt

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/kb-labs/create/v2/contracts"
)

func Path(platformRoot string) string {
	return filepath.Join(platformRoot, ".kb", "v2", "receipt.json")
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
