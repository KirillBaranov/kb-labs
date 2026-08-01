// Package deployment owns the portable production-image contract emitted by
// kb-create. It deliberately has no dependency on a running KB platform.
package deployment

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

const ContractSchema = "kb.deployment/1"

// Matrix is a release artifact, not Go policy. A release may add components
// (CLI, protocol, Node ABI, plugin contracts) and rules without changing
// kb-create's compatibility engine.
type Matrix struct {
	Schema     string               `json:"schema"`
	Components map[string]Component `json:"components"`
	Rules      []Rule               `json:"rules"`
}

type Component struct {
	Package string `json:"package"`
}

// Rule applies when Component is in VersionRange and constrains the versions
// of other named components. Ranges are conjunctions such as
// ">=2.95.0 <=2.120.0".
type Rule struct {
	Component    string            `json:"component"`
	VersionRange string            `json:"versionRange"`
	Requires     map[string]string `json:"requires"`
}

// Contract is persisted beside an exported config and portable marketplace
// lock. Requirements are calculated at export time from the release matrix;
// they are intentionally data, never a platform/SDK special case in code.
type Contract struct {
	Schema       string            `json:"schema"`
	Service      string            `json:"service"`
	Versions     map[string]string `json:"versions"`
	Requirements map[string]string `json:"requirements"`
}

// ReadMatrix reads a release compatibility artifact.
func ReadMatrix(path string) (Matrix, error) {
	data, err := os.ReadFile(path) // #nosec G304 -- explicit CLI input.
	if err != nil {
		return Matrix{}, fmt.Errorf("read compatibility matrix %q: %w", path, err)
	}
	var matrix Matrix
	if err := json.Unmarshal(data, &matrix); err != nil {
		return Matrix{}, fmt.Errorf("parse compatibility matrix %q: %w", path, err)
	}
	if matrix.Schema != "kb.compatibility/1" || len(matrix.Components) == 0 {
		return Matrix{}, fmt.Errorf("invalid compatibility matrix %q", path)
	}
	return matrix, nil
}

// ReadVersions reads every component declared by the matrix from an installed
// platform/image root. Package identity is therefore matrix data rather than
// a hard-coded platform or SDK assumption.
func ReadVersions(root string, matrix Matrix) (map[string]string, error) {
	ids := make([]string, 0, len(matrix.Components))
	for id := range matrix.Components {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	versions := make(map[string]string, len(ids))
	for _, id := range ids {
		component := matrix.Components[id]
		version, err := readPackageVersion(root, component.Package)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", id, err)
		}
		versions[id] = version
	}
	return versions, nil
}

func readPackageVersion(root, packageName string) (string, error) {
	path := filepath.Join(root, "node_modules", filepath.FromSlash(packageName), "package.json")
	data, err := os.ReadFile(path) // #nosec G304 -- root is an explicit CLI argument.
	if err != nil {
		return "", fmt.Errorf("%s is not installed at %s: %w", packageName, path, err)
	}
	var pkg struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(data, &pkg); err != nil {
		return "", fmt.Errorf("parse %s: %w", path, err)
	}
	if pkg.Version == "" {
		return "", fmt.Errorf("%s has no version in %s", packageName, path)
	}
	return pkg.Version, nil
}

// CheckTarget validates both the base image itself and the requirements that
// the exported composition carries. It allows an N-10 image only where the
// release matrix explicitly says that combination is compatible.
func CheckTarget(contract Contract, target map[string]string, matrix Matrix) error {
	if contract.Schema != ContractSchema {
		return fmt.Errorf("unsupported deployment contract %q (expected %s)", contract.Schema, ContractSchema)
	}
	if err := ValidateVersions(target, matrix); err != nil {
		return fmt.Errorf("target image is incompatible: %w", err)
	}
	return checkRequirements(contract.Requirements, target)
}

// RequirementsFor records the release-matrix constraints that applied to an
// exported local composition. The resulting contract stays range-based: a
// later base image is accepted only when the release matrix says it is safe.
func RequirementsFor(versions map[string]string, matrix Matrix) (map[string]string, error) {
	requirements := make(map[string]string)
	for _, rule := range matrix.Rules {
		version, ok := versions[rule.Component]
		if !ok {
			return nil, fmt.Errorf("matrix rule references missing component %q", rule.Component)
		}
		matches, err := satisfies(version, rule.VersionRange)
		if err != nil {
			return nil, err
		}
		if !matches {
			continue
		}
		requirements[rule.Component] = rule.VersionRange
		for component, versionRange := range rule.Requires {
			requirements[component] = versionRange
		}
	}
	if err := checkRequirements(requirements, versions); err != nil {
		return nil, err
	}
	return requirements, nil
}

// ValidateVersions applies all matching release-matrix rules to a component set.
func ValidateVersions(versions map[string]string, matrix Matrix) error {
	matched := make(map[string]bool, len(matrix.Components))
	hasRule := make(map[string]bool, len(matrix.Components))
	for _, rule := range matrix.Rules {
		hasRule[rule.Component] = true
		version, ok := versions[rule.Component]
		if !ok {
			return fmt.Errorf("matrix rule references missing component %q", rule.Component)
		}
		matches, err := satisfies(version, rule.VersionRange)
		if err != nil {
			return fmt.Errorf("invalid range for %s: %w", rule.Component, err)
		}
		if !matches {
			continue
		}
		matched[rule.Component] = true
		if err := checkRequirements(rule.Requires, versions); err != nil {
			return fmt.Errorf("%s %s: %w", rule.Component, version, err)
		}
	}
	for component := range hasRule {
		if !matched[component] {
			return fmt.Errorf("no compatibility rule supports %s %s", component, versions[component])
		}
	}
	return nil
}

func checkRequirements(requirements, versions map[string]string) error {
	ids := make([]string, 0, len(requirements))
	for id := range requirements {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		actual, ok := versions[id]
		if !ok {
			return fmt.Errorf("required component %q is absent", id)
		}
		matches, err := satisfies(actual, requirements[id])
		if err != nil {
			return fmt.Errorf("invalid requirement for %s: %w", id, err)
		}
		if !matches {
			return fmt.Errorf("%s %s does not satisfy required range %s", id, actual, requirements[id])
		}
	}
	return nil
}

type semver struct{ major, minor, patch int }

func satisfies(version, expr string) (bool, error) {
	for _, clause := range strings.Fields(expr) {
		if clause == "*" {
			continue
		}
		op := "="
		for _, candidate := range []string{">=", "<=", ">", "<", "="} {
			if strings.HasPrefix(clause, candidate) {
				op, clause = candidate, strings.TrimPrefix(clause, candidate)
				break
			}
		}
		got, err := parseSemver(version)
		if err != nil {
			return false, err
		}
		want, err := parseSemver(clause)
		if err != nil {
			return false, err
		}
		comparison := compareSemver(got, want)
		if (op == "=" && comparison != 0) || (op == ">" && comparison <= 0) || (op == ">=" && comparison < 0) || (op == "<" && comparison >= 0) || (op == "<=" && comparison > 0) {
			return false, nil
		}
	}
	return true, nil
}

func parseSemver(raw string) (semver, error) {
	parts := strings.Split(strings.TrimPrefix(raw, "v"), ".")
	if len(parts) != 3 {
		return semver{}, fmt.Errorf("%q is not a semantic version", raw)
	}
	values := [3]int{}
	for i, part := range parts {
		value, err := strconv.Atoi(part)
		if err != nil || value < 0 {
			return semver{}, fmt.Errorf("%q is not a semantic version", raw)
		}
		values[i] = value
	}
	return semver{values[0], values[1], values[2]}, nil
}

func compareSemver(a, b semver) int {
	if a.major != b.major {
		if a.major < b.major {
			return -1
		}
		return 1
	}
	if a.minor != b.minor {
		if a.minor < b.minor {
			return -1
		}
		return 1
	}
	if a.patch < b.patch {
		return -1
	}
	if a.patch > b.patch {
		return 1
	}
	return 0
}
