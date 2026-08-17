// Package doctor compares installed manifest requirements with effective
// generated configuration. It reports a structured repair plan and never
// serializes secret values.
package doctor

import (
	"encoding/json"
	"sort"

	"github.com/kb-labs/create/v2/contracts"
)

type Manifest struct {
	ID           string        `json:"id"`
	Requirements []Requirement `json:"requirements"`
}
type Requirement struct {
	ID       string   `json:"id,omitempty"`
	Path     string   `json:"path"`
	Secret   bool     `json:"secret"`
	Required bool     `json:"required"`
	Hint     string   `json:"hint"`
	Env      string   `json:"env,omitempty"`
	Services []string `json:"services,omitempty"`
	// Default is present only when the manifest explicitly declares a safe,
	// non-secret value. Its absence means doctor must request input instead of
	// inventing a configuration choice.
	Default json.RawMessage `json:"default,omitempty"`
}
type Finding struct {
	Code      string          `json:"code"`
	Component string          `json:"component"`
	Path      string          `json:"path"`
	Hint      string          `json:"hint"`
	SafeFix   bool            `json:"safeFix"`
	Default   json.RawMessage `json:"default,omitempty"`
}

type RepairPlan struct {
	SafeDefaults  []Finding `json:"safeDefaults"`
	RequiredInput []Finding `json:"requiredInput"`
}

// Diagnose accepts values only as presence/validation state. Callers must not
// pass the actual secret material through this boundary.
func Diagnose(manifests []Manifest, configured map[string]bool) []Finding {
	findings := make([]Finding, 0)
	for _, manifest := range manifests {
		for _, requirement := range manifest.Requirements {
			key := requirement.Path
			if requirement.Secret {
				key = requirement.ID
			}
			if !requirement.Required || configured[key] {
				continue
			}
			code := contracts.CodeConfigRequired
			if requirement.Secret {
				code = contracts.CodeInputRequired
			}
			safeFix := !requirement.Secret && len(requirement.Default) != 0
			findings = append(findings, Finding{Code: code, Component: manifest.ID, Path: requirement.Path, Hint: requirement.Hint, SafeFix: safeFix, Default: append(json.RawMessage(nil), requirement.Default...)})
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
