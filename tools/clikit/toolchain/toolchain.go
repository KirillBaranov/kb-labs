// Package toolchain defines the shared runtime contract for KB Labs launchers.
// It is intentionally independent of a particular CLI so human, agent and CI
// frontends report the same fail-fast diagnostics.
package toolchain

import (
	"bufio"
	"fmt"
	"io"
	"os/exec"
	"strconv"
	"strings"
)

const (
	SupportedNodeMajor = 24
	SupportedPnpmMajor = 11
	SupportedPnpm      = "11.4.0"
)

type Status struct{ NodeVersion, PnpmVersion string }

type ValidationError struct {
	Tool, Detected, Requirement, Remediation string
}

func (e *ValidationError) Error() string {
	if e.Detected == "" {
		return fmt.Sprintf("%s was not found; KB Labs requires %s. %s", e.Tool, e.Requirement, e.Remediation)
	}
	return fmt.Sprintf("%s %s is unsupported; KB Labs requires %s. %s", e.Tool, e.Detected, e.Requirement, e.Remediation)
}

func NodeRemediation() string {
	return fmt.Sprintf("Update Node.js and retry (for nvm: `nvm install %d && nvm use %d`)", SupportedNodeMajor, SupportedNodeMajor)
}
func PnpmRemediation() string { return fmt.Sprintf("Install pnpm@%s and retry", SupportedPnpm) }

func Version(binary string) (string, error) {
	if strings.TrimSpace(binary) == "" {
		return "", nil
	}
	out, err := exec.Command(binary, "--version").Output() // #nosec G204 -- binary is selected by the launcher
	if err != nil {
		return "", fmt.Errorf("read version from %s: %w", binary, err)
	}
	return strings.TrimSpace(string(out)), nil
}

func ValidateNode(version string) error {
	major, err := major(version)
	if err != nil || major != SupportedNodeMajor {
		return &ValidationError{Tool: "Node.js", Detected: version, Requirement: fmt.Sprintf("Node.js %d.x only", SupportedNodeMajor), Remediation: NodeRemediation()}
	}
	return nil
}

func ValidatePnpm(version string) error {
	major, err := major(version)
	if err != nil || major != SupportedPnpmMajor {
		return &ValidationError{Tool: "pnpm", Detected: version, Requirement: fmt.Sprintf("pnpm %d.x", SupportedPnpmMajor), Remediation: PnpmRemediation()}
	}
	return nil
}

func Validate(status Status, requirePnpm bool) error {
	if err := ValidateNode(status.NodeVersion); err != nil {
		return err
	}
	if requirePnpm {
		return ValidatePnpm(status.PnpmVersion)
	}
	return nil
}

func ConfirmUpdate(in io.Reader, out io.Writer, issue *ValidationError) bool {
	if issue == nil {
		return false
	}
	fmt.Fprintf(out, "%s\nWould you like to update now? [y/N] ", issue.Error())
	line, _ := bufio.NewReader(in).ReadString('\n')
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(line)), "y")
}

func major(version string) (int, error) {
	part := strings.TrimPrefix(strings.TrimSpace(version), "v")
	if i := strings.IndexByte(part, '.'); i >= 0 {
		part = part[:i]
	}
	value, err := strconv.Atoi(part)
	if err != nil {
		return 0, fmt.Errorf("invalid semantic version")
	}
	return value, nil
}
