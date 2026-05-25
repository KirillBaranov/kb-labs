// Package scenario implements e2e test scenarios as a kb-dev primitive.
//
// A scenario is a declarative description of a desired test stand state:
//
//   - A set of config overlays (JSONC files) to apply on top of the resolved
//     platform↔project config (see core-config ADR-0001).
//   - A list of services to restart after the overlays change.
//   - An optional domain (devservices group) to ensure is alive before applying.
//
// The scenario package is filesystem-only — it does not import the Manager.
// Command code orchestrates: scenario.Load → ComputeDiff → Plan.Apply, then
// asks the Manager to ensure/restart services. This keeps the package
// unit-testable in isolation.
//
// State convention: applied overlays live in `<projectRoot>/.kb/overlays/`
// and are named `{scenarioSlug}__{originalFilename}`. The `__` infix marks
// a file as scenario-managed; unprefixed `.jsonc` files in the same
// directory belong to the user and are preserved.
package scenario

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// DefaultScenarioName is the reserved name that means "reset overlays".
// `kb-dev ensure --scenario default` removes every scenario-managed file from
// `.kb/overlays/` and triggers a restart of any services that were carrying
// scenario state. Unprefixed user files are preserved.
const DefaultScenarioName = "default"

// scenarioPrefixSeparator marks a file in .kb/overlays/ as scenario-managed.
// A name like `pressure__overlay.jsonc` is owned by the `pressure` scenario.
const scenarioPrefixSeparator = "__"

// Scenario is the declarative description of a test stand state, parsed
// from scenario.yaml.
type Scenario struct {
	// Name is the scenario slug. Required. Used as the prefix for files
	// placed under `.kb/overlays/`. Must not contain `__`.
	Name string `yaml:"name"`

	// Overlays is the list of overlay files this scenario applies, relative
	// to the directory containing scenario.yaml. Each file must exist on disk
	// at scenario load time.
	Overlays []string `yaml:"overlays"`

	// Restarts is the explicit list of service names (matching keys in
	// devservices.yaml) that must be restarted after the overlay state
	// changes. Idempotent application skips restart when the overlay set
	// is unchanged.
	Restarts []string `yaml:"restarts"`

	// Domain is the optional devservices group name. When set, the command
	// ensures these services are alive before restarting `Restarts`, so a
	// cold system can be brought into scenario state with one call.
	Domain string `yaml:"domain,omitempty"`

	// baseDir is the directory containing scenario.yaml. Populated by Load.
	baseDir string
}

// BaseDir returns the directory the scenario was loaded from.
func (s *Scenario) BaseDir() string { return s.baseDir }

// Load reads and validates a scenario.yaml.
//
// Returns an error when:
//   - the file is unreadable or malformed YAML;
//   - the scenario name is empty, contains the `__` infix, or equals the
//     reserved name `default`;
//   - any referenced overlay file does not exist on disk relative to the
//     scenario.yaml directory.
func Load(path string) (*Scenario, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read scenario: %w", err)
	}
	var s Scenario
	if err := yaml.Unmarshal(raw, &s); err != nil {
		return nil, fmt.Errorf("parse scenario %s: %w", path, err)
	}
	s.baseDir = filepath.Dir(path)

	if err := s.validate(); err != nil {
		return nil, fmt.Errorf("invalid scenario %s: %w", path, err)
	}
	return &s, nil
}

func (s *Scenario) validate() error {
	if strings.TrimSpace(s.Name) == "" {
		return fmt.Errorf("name is required")
	}
	if s.Name == DefaultScenarioName {
		return fmt.Errorf("name %q is reserved; use a different scenario name", DefaultScenarioName)
	}
	if strings.Contains(s.Name, scenarioPrefixSeparator) {
		return fmt.Errorf("name %q must not contain %q", s.Name, scenarioPrefixSeparator)
	}
	for _, ov := range s.Overlays {
		if ov == "" {
			return fmt.Errorf("overlay entry must not be empty")
		}
		full := filepath.Join(s.baseDir, ov)
		if _, err := os.Stat(full); err != nil {
			return fmt.Errorf("overlay file not found: %s", full)
		}
	}
	return nil
}

// TargetFilename returns the name a scenario overlay file gets when copied
// into `.kb/overlays/`. Example: scenario `pressure`, source `overlay.jsonc`
// → `pressure__overlay.jsonc`.
func (s *Scenario) TargetFilename(source string) string {
	return s.Name + scenarioPrefixSeparator + filepath.Base(source)
}

