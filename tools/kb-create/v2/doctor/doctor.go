// Package doctor compares installed manifest requirements with effective
// generated configuration. It reports a structured repair plan and never
// serializes secret values.
package doctor

import (
	"sort"

	"github.com/kb-labs/create/v2/contracts"
)

type Manifest struct {
	ID           string
	Requirements []Requirement
}
type Requirement struct {
	Path     string
	Secret   bool
	Required bool
	Hint     string
}
type Finding struct {
	Code, Component, Path, Hint string
	SafeFix                     bool
}

type RepairPlan struct {
	SafeDefaults  []Finding
	RequiredInput []Finding
}

// Diagnose accepts values only as presence/validation state. Callers must not
// pass the actual secret material through this boundary.
func Diagnose(manifests []Manifest, configured map[string]bool) []Finding {
	findings := make([]Finding, 0)
	for _, manifest := range manifests {
		for _, requirement := range manifest.Requirements {
			if !requirement.Required || configured[requirement.Path] {
				continue
			}
			code := contracts.CodeConfigRequired
			if requirement.Secret {
				code = contracts.CodeInputRequired
			}
			findings = append(findings, Finding{Code: code, Component: manifest.ID, Path: requirement.Path, Hint: requirement.Hint, SafeFix: !requirement.Secret})
		}
	}
	sort.Slice(findings, func(i, j int) bool {
		if findings[i].Component == findings[j].Component {
			return findings[i].Path < findings[j].Path
		}
		return findings[i].Component < findings[j].Component
	})
	return findings
}

// PlanRepair turns findings into an explicit recovery contract. Safe defaults
// can be rendered automatically; secret or otherwise unsafe input remains a
// required user/agent answer and is never guessed by doctor --fix.
func PlanRepair(findings []Finding) RepairPlan {
	result := RepairPlan{}
	for _, finding := range findings {
		if finding.SafeFix {
			result.SafeDefaults = append(result.SafeDefaults, finding)
		} else {
			result.RequiredInput = append(result.RequiredInput, finding)
		}
	}
	return result
}

// ApplySafe executes only the fixes explicitly marked safe. The callback
// receives a config path, never a secret value.
func ApplySafe(plan RepairPlan, apply func(Finding) error) error {
	for _, finding := range plan.SafeDefaults {
		if err := apply(finding); err != nil {
			return err
		}
	}
	return nil
}
