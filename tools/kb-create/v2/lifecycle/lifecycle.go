// Package lifecycle owns the recovery semantics shared by V2 update,
// uninstall and doctor --fix. Commands supply the mutation; this package
// guarantees the snapshot/restore boundary around it.
package lifecycle

import (
	"fmt"
	"time"

	"github.com/kb-labs/create/v2/contracts"
	"github.com/kb-labs/create/v2/receipt"
)

type Mutation func() error

// Mutate snapshots the active verified receipt before a destructive change.
// A failed mutation or verification restores the exact managed state and
// returns the snapshot ID, so both humans and agents have a deterministic
// recovery reference.
func Mutate(platformRoot string, now time.Time, apply, verify Mutation) (contracts.Snapshot, error) {
	snapshot, err := receipt.CreateSnapshot(platformRoot, now)
	if err != nil {
		return contracts.Snapshot{}, fmt.Errorf("create recovery snapshot: %w", err)
	}
	if err := apply(); err != nil {
		return recover(platformRoot, snapshot, "apply", err)
	}
	if verify != nil {
		if err := verify(); err != nil {
			return recover(platformRoot, snapshot, "verify", err)
		}
	}
	return snapshot, nil
}

func Rollback(platformRoot, snapshotID string) (contracts.Snapshot, error) {
	snapshot, err := receipt.RestoreSnapshot(platformRoot, snapshotID)
	if err != nil {
		return contracts.Snapshot{}, fmt.Errorf("restore snapshot %s: %w", snapshotID, err)
	}
	return snapshot, nil
}

func recover(platformRoot string, snapshot contracts.Snapshot, stage string, cause error) (contracts.Snapshot, error) {
	if _, restoreErr := receipt.RestoreSnapshot(platformRoot, snapshot.ID); restoreErr != nil {
		return snapshot, fmt.Errorf("%s failed: %w; rollback to snapshot %s also failed: %v", stage, cause, snapshot.ID, restoreErr)
	}
	return snapshot, fmt.Errorf("%s failed: %w; restored snapshot %s", stage, cause, snapshot.ID)
}
