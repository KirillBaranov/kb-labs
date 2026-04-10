package checks

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/kb-labs/devkit/internal/config"
	"github.com/kb-labs/devkit/internal/workspace"
)

type externalRule struct {
	name          string
	run           string
	fix           string
	phase         string
	language      string
	workspaceRoot string
	checkConfig   config.CheckPackConfig
}

type externalInput struct {
	Package       workspace.Package `json:"package"`
	Preset        config.Preset     `json:"preset"`
	WorkspaceRoot string            `json:"workspaceRoot"`
	Check         string            `json:"check"`
	Phase         string            `json:"phase"`
	DryRun        bool              `json:"dryRun,omitempty"`
	Config        map[string]any    `json:"config,omitempty"`
	Issues        []Issue           `json:"issues,omitempty"`
}

type externalCheckOutput struct {
	Issues []Issue `json:"issues"`
}

type externalFixOutput struct {
	Actions []string `json:"actions"`
}

func (r *externalRule) Name() string { return r.name }

func (r *externalRule) Check(pkg workspace.Package, preset config.Preset) []Issue {
	out, err := r.runCommand(r.run, pkg, preset, nil, false)
	if err == nil {
		return out.Issues
	}
	if len(out.Issues) > 0 {
		return out.Issues
	}
	return []Issue{{
		Check:    r.name,
		Severity: SeverityError,
		Message:  err.Error(),
		File:     pkg.Dir,
	}}
}

func (r *externalRule) Apply(pkg workspace.Package, issues []Issue, dryRun bool) error {
	if strings.TrimSpace(r.fix) == "" {
		return nil
	}
	_, err := r.runCommand(r.fix, pkg, config.Preset{}, issues, dryRun)
	return err
}

func (r *externalRule) runCommand(command string, pkg workspace.Package, preset config.Preset, issues []Issue, dryRun bool) (externalCheckOutput, error) {
	input := externalInput{
		Package:       pkg,
		Preset:        preset,
		WorkspaceRoot: r.workspaceRoot,
		Check:         r.name,
		Phase:         r.phase,
		DryRun:        dryRun,
		Config:        r.checkConfig.Config,
		Issues:        issues,
	}
	payload, err := json.Marshal(input)
	if err != nil {
		return externalCheckOutput{}, fmt.Errorf("marshal external check input for %s: %w", r.name, err)
	}

	cmd := exec.Command("sh", "-lc", command)
	cmd.Dir = r.workspaceRoot
	cmd.Stdin = bytes.NewReader(payload)
	cmd.Env = append(os.Environ(),
		"KB_DEVKIT_MODE="+modeForCommand(issues),
		"KB_DEVKIT_CHECK_NAME="+r.name,
		"KB_DEVKIT_WORKSPACE_ROOT="+r.workspaceRoot,
		"KB_DEVKIT_PACKAGE_NAME="+pkg.Name,
		"KB_DEVKIT_PACKAGE_DIR="+pkg.Dir,
		"KB_DEVKIT_PACKAGE_REL="+pkg.RelPath,
		"KB_DEVKIT_PACKAGE_CATEGORY="+pkg.Category,
		"KB_DEVKIT_PACKAGE_PRESET="+pkg.Preset,
		"KB_DEVKIT_PACKAGE_LANGUAGE="+pkg.Language,
		"KB_DEVKIT_DRY_RUN="+fmt.Sprintf("%t", dryRun),
	)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	runErr := cmd.Run()

	var parsed externalCheckOutput
	if strings.TrimSpace(stdout.String()) != "" {
		if err := json.Unmarshal(stdout.Bytes(), &parsed); err != nil && runErr == nil {
			return externalCheckOutput{}, fmt.Errorf("decode external check %s output: %w", r.name, err)
		}
	}

	if runErr != nil && len(parsed.Issues) == 0 {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = strings.TrimSpace(stdout.String())
		}
		if msg == "" {
			msg = runErr.Error()
		}
		return externalCheckOutput{}, fmt.Errorf("external check %s failed: %s", r.name, msg)
	}

	return parsed, nil
}

func modeForCommand(issues []Issue) string {
	if len(issues) > 0 {
		return "fix"
	}
	return "check"
}

func matchesPhase(check config.CustomCheck, phase string) bool {
	if len(check.On) == 0 {
		return phase == "check"
	}
	for _, on := range check.On {
		if on == phase {
			return true
		}
	}
	return false
}

func matchesLanguage(check config.CustomCheck, language string) bool {
	if check.Language == "" || check.Language == "any" {
		return true
	}
	return check.Language == language
}
