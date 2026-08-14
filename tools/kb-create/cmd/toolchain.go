package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/kb-labs/create/internal/toolchain"
)

// ensureToolchain keeps CI non-interactive while giving human installs a
// recoverable update path. Node.js cannot be safely replaced inside the
// running process, so the prompt prints the exact command and stops; pnpm can
// be activated in-place and the install continues after revalidation.
func ensureToolchain(nonInteractive bool, manager string) error {
	status, err := toolchain.Inspect(manager)
	if status.NodeVersion != "" {
		if nodeErr := toolchain.Validate(toolchain.Status{NodeVersion: status.NodeVersion}); nodeErr != nil {
			msg := fmt.Sprintf("Node.js %s is not supported; KB Labs requires Node.js %d or newer. Update Node.js to %d? [y/N] ", status.NodeVersion, toolchain.NodeMajor, toolchain.NodeMajor)
			if !nonInteractive && confirmToolchain(msg) {
				return fmt.Errorf("please update Node.js to %d and run kb-create again (for nvm: `nvm install %d && nvm use %d`)", toolchain.NodeMajor, toolchain.NodeMajor, toolchain.NodeMajor)
			}
			return fmt.Errorf("Node.js %s is unsupported; install Node.js %d or newer and run kb-create again", status.NodeVersion, toolchain.NodeMajor)
		}
	}
	// Corepack may be unable to start pnpm at all with an old Node.js. Node
	// was validated above from the partial status, so users receive a direct
	// runtime fix instead of a package-manager stack trace.
	if err != nil {
		return err
	}
	if err := toolchain.Validate(status); err == nil {
		return nil
	}

	if manager == "pnpm" {
		shouldUpdate := nonInteractive
		if !nonInteractive {
			fmt.Printf("pnpm %s is not supported by this platform; KB Labs uses pnpm %s. Update pnpm? [y/N] ", status.PnpmVersion, toolchain.PnpmVersion)
			shouldUpdate = confirmToolchain("")
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

func confirmToolchain(prompt string) bool {
	if prompt != "" {
		fmt.Print(prompt)
	}
	line, _ := bufio.NewReader(os.Stdin).ReadString('\n')
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(line)), "y")
}

func major(version string) (int, error) {
	version = strings.TrimPrefix(strings.TrimSpace(version), "v")
	var value int
	_, err := fmt.Sscanf(version, "%d", &value)
	return value, err
}
