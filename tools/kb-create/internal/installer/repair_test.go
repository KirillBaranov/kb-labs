package installer

import (
	"errors"
	"testing"
)

// TestRepairNodeModulesUsesRestore verifies that `doctor --fix` for missing
// node_modules goes through pm.PackageManager.Restore rather than shelling out
// to a bare "pnpm install" directly. Restore is where BUG-01's
// ERR_PNPM_IGNORED_BUILDS recovery (headless `pnpm approve-builds --all` +
// retry) lives — a doctor path that bypasses it can hit the very
// non-interactive-prompt failure it exists to repair.
func TestRepairNodeModulesUsesRestore(t *testing.T) {
	fake := &fakePM{name: "pnpm"}
	ins := &Installer{PM: fake, Log: discardLogger()}

	if err := ins.RepairNodeModules("/tmp/does-not-matter"); err != nil {
		t.Fatalf("RepairNodeModules() error = %v", err)
	}
	if len(fake.calls) != 1 || fake.calls[0] != "restore" {
		t.Fatalf("RepairNodeModules() calls = %v, want [restore]", fake.calls)
	}
}

func TestRepairNodeModulesPropagatesRestoreError(t *testing.T) {
	wantErr := errors.New("boom")
	fake := &fakePM{name: "pnpm", failErr: wantErr}
	ins := &Installer{PM: fake, Log: discardLogger()}

	err := ins.RepairNodeModules("/tmp/does-not-matter")
	if err == nil || !errors.Is(err, wantErr) {
		t.Fatalf("RepairNodeModules() error = %v, want wrapped %v", err, wantErr)
	}
}
