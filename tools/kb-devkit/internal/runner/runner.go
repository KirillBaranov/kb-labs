// Package runner executes custom checkers as shell commands.
// Contract: $1 = package dir, exit 0 = pass, exit 1 = fail,
// stdout may contain JSON []Issue (optional).
package runner

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os/exec"

	"github.com/kb-labs/devkit/internal/checks"
)

// RunCustom executes a custom checker script for the given package directory.
// Returns any issues parsed from stdout, plus an error issue on failure.
func RunCustom(script, pkgDir string) ([]checks.Issue, error) {
	cmd := exec.Command("sh", "-c", script+" "+pkgDir)
	cmd.Dir = pkgDir

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()

	// Try to parse stdout as JSON issues regardless of exit code.
	var issues []checks.Issue
	if stdout.Len() > 0 {
		if jsonErr := json.Unmarshal(stdout.Bytes(), &issues); jsonErr != nil {
			// stdout is not JSON — treat as human-readable output.
		}
	}

	if err != nil {
		// Non-zero exit: add a synthetic error issue.
		msg := fmt.Sprintf("custom check %q failed: %v", script, err)
		if stderr.Len() > 0 {
			msg += "\n" + stderr.String()
		}
		issues = append(issues, checks.Issue{
			Check:    "custom:" + script,
			Severity: checks.SeverityError,
			Message:  msg,
		})
	}

	return issues, nil
}
