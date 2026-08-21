package cmd

import (
	"context"
	"fmt"
	"os"

	sharedtoolchain "github.com/kb-labs/clikit/toolchain"
	"github.com/kb-labs/create/internal/toolchain"
)

// ensureToolchain keeps CI non-interactive while giving human installs a
// recoverable update path. The shared updater activates Node.js for this
// process, so package-manager commands started afterwards use the same runtime.
func ensureToolchain(nonInteractive bool, manager string) error {
	status, inspectErr := toolchain.Inspect(manager)
	if nodeErr := sharedtoolchain.ValidateNode(status.NodeVersion); nodeErr != nil {
		issue, _ := nodeErr.(*sharedtoolchain.ValidationError)
		if nonInteractive || !sharedtoolchain.ConfirmUpdate(os.Stdin, os.Stdout, issue) {
			return nodeErr
		}
		nodePath, err := sharedtoolchain.UpdateNode(context.Background())
		if err != nil {
			return err
		}
		if err := sharedtoolchain.ActivateNode(nodePath); err != nil {
			return err
		}
		status, inspectErr = toolchain.Inspect(manager)
		if nodeErr := sharedtoolchain.ValidateNode(status.NodeVersion); nodeErr != nil {
			return nodeErr
		}
	}
	// Corepack may be unable to start pnpm at all with an old Node.js. Node
	// was validated above from the partial status, so users receive a direct
	// runtime fix instead of a package-manager stack trace.
	if inspectErr != nil {
		return inspectErr
	}
	validationErr := toolchain.Validate(status)
	if validationErr == nil {
		return nil
	}

	if manager == "pnpm" {
		shouldUpdate := nonInteractive
		if !nonInteractive {
			issue, _ := validationErr.(*sharedtoolchain.ValidationError)
			shouldUpdate = sharedtoolchain.ConfirmUpdate(os.Stdin, os.Stdout, issue)
		}
		if !shouldUpdate {
			return fmt.Errorf("install pnpm@%s and run kb-create again", toolchain.PnpmVersion)
		}
		fmt.Printf("Preparing pnpm %s for this platform…\n", toolchain.PnpmVersion)
		if err := toolchain.UpgradePnpm(); err != nil {
			return err
		}
		updated, err := toolchain.Inspect(manager)
		if err != nil {
			return err
		}
		return toolchain.Validate(updated)
	}
	return fmt.Errorf("unsupported package manager/toolchain; use pnpm@%s", toolchain.PnpmVersion)
}
