package toolchain

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// UpdateNode only uses an already-installed version manager. It never installs
// nvm or Volta as a surprising machine-wide side effect.
func UpdateNode(ctx context.Context) (string, error) {
	if nvmDir := findNvmDir(); nvmDir != "" {
		command := exec.CommandContext(ctx, "bash", "-lc", "source \"$NVM_DIR/nvm.sh\" && nvm install 24 >/dev/null && nvm which 24") // #nosec G204 -- fixed command
		command.Env = append(os.Environ(), "NVM_DIR="+nvmDir)
		out, err := command.Output()
		if err != nil {
			return "", fmt.Errorf("update Node.js with nvm: %w", err)
		}
		return validateNodePath(lastLine(string(out)))
	}
	if volta, err := exec.LookPath("volta"); err == nil {
		if out, runErr := exec.CommandContext(ctx, volta, "install", "node@24").CombinedOutput(); runErr != nil {
			return "", fmt.Errorf("update Node.js with Volta: %s", strings.TrimSpace(string(out)))
		}
		out, runErr := exec.CommandContext(ctx, volta, "which", "node").Output()
		if runErr != nil {
			return "", fmt.Errorf("find Node.js installed by Volta: %w", runErr)
		}
		return validateNodePath(lastLine(string(out)))
	}
	return "", fmt.Errorf("cannot update Node.js automatically: install nvm or Volta first. %s", NodeRemediation())
}

func ActivateNode(nodePath string) error {
	nodePath, err := validateNodePath(nodePath)
	if err != nil {
		return err
	}
	return os.Setenv("PATH", filepath.Dir(nodePath)+string(os.PathListSeparator)+os.Getenv("PATH"))
}

// UpdatePnpm activates the pnpm line used by generated platforms. It prefers
// Corepack, but falls back to npm for Node distributions without Corepack.
func UpdatePnpm() error {
	if _, err := exec.LookPath("corepack"); err == nil {
		if out, runErr := exec.Command("corepack", "prepare", "pnpm@"+SupportedPnpm, "--activate").CombinedOutput(); runErr == nil {
			return nil
		} else if strings.TrimSpace(string(out)) != "" {
			// Fall through to npm; its error is more actionable when neither
			// mechanism is usable.
		}
	}
	if _, err := exec.LookPath("npm"); err != nil {
		return fmt.Errorf("cannot update pnpm: neither corepack nor npm is available")
	}
	if out, err := exec.Command("npm", "install", "--global", "pnpm@"+SupportedPnpm).CombinedOutput(); err != nil {
		return fmt.Errorf("install pnpm@%s: %s", SupportedPnpm, strings.TrimSpace(string(out)))
	}
	return nil
}

func findNvmDir() string {
	nvmDir := os.Getenv("NVM_DIR")
	if nvmDir == "" {
		if home, err := os.UserHomeDir(); err == nil {
			nvmDir = filepath.Join(home, ".nvm")
		}
	}
	if nvmDir == "" {
		return ""
	}
	info, err := os.Stat(filepath.Join(nvmDir, "nvm.sh"))
	if err != nil || info.IsDir() {
		return ""
	}
	return nvmDir
}

func validateNodePath(nodePath string) (string, error) {
	nodePath = strings.TrimSpace(nodePath)
	if nodePath == "" {
		return "", fmt.Errorf("version manager did not return a Node.js path")
	}
	version, err := Version(nodePath)
	if err != nil {
		return "", err
	}
	if err := ValidateNode(version); err != nil {
		return "", err
	}
	return nodePath, nil
}

func lastLine(text string) string {
	parts := strings.Fields(strings.TrimSpace(text))
	if len(parts) == 0 {
		return ""
	}
	return parts[len(parts)-1]
}
