// Package runtime is the autonomous V2 application boundary. It accepts an
// already resolved plan, applies exact artifacts, renders its projections,
// verifies the resolved service graph and only then commits a receipt.
package runtime

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/kb-labs/create/v2/contracts"
	"github.com/kb-labs/create/v2/lifecycle"
	"github.com/kb-labs/create/v2/receipt"
	"github.com/kb-labs/create/v2/render"
	"github.com/kb-labs/create/v2/verify"
)

type ArtifactInstaller interface {
	Install([]contracts.Artifact) error
	Restore() error
}
type ArtifactUninstaller interface {
	Uninstall([]contracts.Artifact) error
}

type Clock interface{ Now() time.Time }

type systemClock struct{}

func (systemClock) Now() time.Time { return time.Now().UTC() }

type Dependencies struct {
	Artifacts ArtifactInstaller
	Status    verify.StatusProvider
	Clock     Clock
	// CorrelationID is supplied by a frontend; it is persisted verbatim in the
	// receipt and must be safe to disclose in a diagnostic bundle.
	CorrelationID string
}

// Apply is the one V2 fresh-install operation. It deliberately has no
// dependency on legacy manifests, state or package scanning.
func Apply(plan contracts.ResolvedInstallPlan, deps Dependencies) (contracts.InstallReceipt, error) {
	if plan.Schema != contracts.ResolvedPlanSchema {
		return contracts.InstallReceipt{}, fmt.Errorf("apply resolved plan: unsupported schema %q", plan.Schema)
	}
	if deps.Artifacts == nil || deps.Status == nil {
		return contracts.InstallReceipt{}, fmt.Errorf("apply resolved plan: artifact installer and status provider are required")
	}
	if err := deps.Artifacts.Install(plan.Artifacts); err != nil {
		return contracts.InstallReceipt{}, fmt.Errorf("apply exact artifacts: %w", err)
	}
	if _, err := render.Write(plan); err != nil {
		return contracts.InstallReceipt{}, fmt.Errorf("render resolved projections: %w", err)
	}
	now := now(deps.Clock)
	check, err := verify.Run(plan, deps.Status, now)
	if err != nil {
		return contracts.InstallReceipt{}, fmt.Errorf("verify resolved service graph: %w", err)
	}
	result := contracts.InstallReceipt{Schema: contracts.ReceiptSchema, ID: receiptID(plan.PlanHash, now), CreatedAt: now, CorrelationID: deps.CorrelationID, Plan: plan, Verification: check}
	if err := receipt.Write(plan.Request.PlatformRoot, result); err != nil {
		return contracts.InstallReceipt{}, fmt.Errorf("commit verified receipt: %w", err)
	}
	return result, nil
}

// Update creates a recovery snapshot before replacing the resolved artifact
// set. Any apply or graph-verification failure restores managed files, receipt
// and the package-manager lock state through ArtifactInstaller.Restore.
func Update(plan contracts.ResolvedInstallPlan, deps Dependencies) (contracts.InstallReceipt, contracts.Snapshot, error) {
	var result contracts.InstallReceipt
	snapshot, err := lifecycle.Mutate(plan.Request.PlatformRoot, now(deps.Clock), func() error {
		var applyErr error
		result, applyErr = Apply(plan, deps)
		return applyErr
	}, nil, deps.Artifacts.Restore)
	if err != nil {
		return contracts.InstallReceipt{}, snapshot, err
	}
	result.SnapshotID = snapshot.ID
	if err := receipt.Write(plan.Request.PlatformRoot, result); err != nil {
		return contracts.InstallReceipt{}, snapshot, fmt.Errorf("attach recovery snapshot to receipt: %w", err)
	}
	return result, snapshot, nil
}

// Uninstall is intentionally narrow: it removes exactly the artifacts in the
// verified receipt. The snapshot remains in .kb/v2/snapshots so a failed
// operation can recover; a successful deletion leaves explicit recovery data
// rather than claiming user-authored project files are disposable.
func Uninstall(platformRoot string, deps Dependencies) (contracts.Snapshot, error) {
	if deps.Artifacts == nil {
		return contracts.Snapshot{}, fmt.Errorf("uninstall: artifact installer is required")
	}
	uninstaller, ok := deps.Artifacts.(ArtifactUninstaller)
	if !ok {
		return contracts.Snapshot{}, fmt.Errorf("uninstall: artifact installer does not support removal")
	}
	active, err := receipt.Read(platformRoot)
	if err != nil {
		return contracts.Snapshot{}, fmt.Errorf("uninstall: read active receipt: %w", err)
	}
	return lifecycle.Mutate(platformRoot, now(deps.Clock), func() error {
		if err := uninstaller.Uninstall(active.Plan.Artifacts); err != nil {
			return err
		}
		// Only V2-owned projections are removed. Project roots and any user
		// authored files remain outside this operation's authority.
		for _, relative := range []string{".kb/kb.config.jsonc", ".kb/devservices.yaml"} {
			if err := os.Remove(filepath.Join(platformRoot, relative)); err != nil && !os.IsNotExist(err) {
				return fmt.Errorf("remove managed projection %s: %w", relative, err)
			}
		}
		return receipt.Delete(platformRoot)
	}, nil, deps.Artifacts.Restore)
}

func now(clock Clock) time.Time {
	if clock == nil {
		return systemClock{}.Now()
	}
	return clock.Now().UTC()
}

func receiptID(planHash string, createdAt time.Time) string {
	if len(planHash) > 12 {
		planHash = planHash[:12]
	}
	return createdAt.Format("20060102T150405Z") + "-" + planHash
}
