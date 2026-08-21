package toolchain

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// UpdateNode installs the supported Node.js major using an already-installed
// version manager. It deliberately does not bootstrap a version manager: that
// would be a surprising machine-wide change from a KB Labs command.
func UpdateNode(ctx context.Context) (string, error) {
	if nvmDir := findNvmDir(); nvmDir != "" {
		command := exec.CommandContext(ctx, "bash", "-lc", "source \"$NVM_DIR/nvm.sh\" && nvm install 24 >/dev/null && nvm which 24") // #nosec G204 -- command and arguments are fixed
		command.Env = append(os.Environ(), "NVM_DIR="+nvmDir)
		out, err := command.Output()
		if err != nil {
			return "", fmt.Errorf("update Node.js with nvm: %w", err)
		}
		return validateNodePath(lastLine(string(out)))
	}
	if volta, err := exec.LookPath("volta"); err == nil {
		if out, runErr := exec.CommandContext(ctx, volta, "install", "node@24").CombinedOutput(); runErr != nil { // #nosec G204 -- volta comes from PATH
			return "", fmt.Errorf("update Node.js with Volta: %s", strings.TrimSpace(string(out)))
		}
		out, runErr := exec.CommandContext(ctx, volta, "which", "node").Output() // #nosec G204 -- volta comes from PATH
		if runErr != nil {
			return "", fmt.Errorf("find Node.js installed by Volta: %w", runErr)
		}
		return validateNodePath(lastLine(string(out)))
	}
	return "", fmt.Errorf("cannot update Node.js automatically: install nvm or Volta first. %s", NodeRemediation())
}

// ActivateNode prepends the selected Node.js binary directory to PATH for the
// current launcher process and all child processes it creates.
func ActivateNode(nodePath string) error {
	nodePath, err := validateNodePath(nodePath)
	if err != nil {
		return err
	}
	binDir := filepath.Dir(nodePath)
	return os.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
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
	if info, err := os.Stat(filepath.Join(nvmDir, "nvm.sh")); err == nil && !info.IsDir() {
		return nvmDir
	}
	return ""
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
	lines := strings.Fields(strings.TrimSpace(text))
	if len(lines) == 0 {
		return ""
	}
	return lines[len(lines)-1]
}
