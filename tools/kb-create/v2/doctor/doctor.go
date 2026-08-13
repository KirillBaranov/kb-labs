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
