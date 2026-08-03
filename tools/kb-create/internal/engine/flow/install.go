package flow

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/kb-labs/create/internal/engine/plan"
)

// InstallSpec is the declarative bridge from a scenario to the shared
// installer. It contains no executable step or UI behavior.
type InstallSpec struct {
	Components          []ComponentBinding `json:"components,omitempty"`
	ProviderPreferences []ProviderBinding  `json:"providerPreferences,omitempty"`
	Effects             []EffectBinding    `json:"effects,omitempty"`
}

type ComponentBinding struct {
	ID   string     `json:"id"`
	When *Predicate `json:"when,omitempty"`
}

type ProviderBinding struct {
	Capability string `json:"capability"`
	Field      string `json:"field"`
}

type EffectBinding struct {
	ID   string     `json:"id"`
	When *Predicate `json:"when,omitempty"`
}

func (s *Scenario) installSpec() *InstallSpec { return s.Install }

// BuildInstallRequest projects a completed scenario state into the same
// request contract used by direct CI. It does not resolve components or
// providers; plan.Compile remains the single resolver.
func BuildInstallRequest(scenario Scenario, state State, projectRoot, platformRoot, catalogDigest string) (plan.InstallRequest, error) {
	if scenario.Install == nil {
		return plan.InstallRequest{}, fmt.Errorf("scenario %q has no install projection", scenario.ID)
	}
	if state.ScenarioID != scenario.ID {
		return plan.InstallRequest{}, fmt.Errorf("state belongs to scenario %q, want %q", state.ScenarioID, scenario.ID)
	}
	components := make([]string, 0, len(scenario.Install.Components))
	for _, binding := range scenario.Install.Components {
		if binding.ID == "" {
			return plan.InstallRequest{}, fmt.Errorf("scenario has an empty component binding")
		}
		if binding.When == nil || binding.When.Evaluate(state.Values) {
			components = append(components, binding.ID)
		}
	}
	effects := make([]string, 0, len(scenario.Install.Effects))
	for _, binding := range scenario.Install.Effects {
		if binding.ID == "" {
			return plan.InstallRequest{}, fmt.Errorf("scenario has an empty effect binding")
		}
		if binding.When == nil || binding.When.Evaluate(state.Values) {
			effects = append(effects, binding.ID)
		}
	}
	sort.Strings(effects)
	sort.Strings(components)
	preferences := make(map[string][]string)
	for _, binding := range scenario.Install.ProviderPreferences {
		raw, ok := state.Values[binding.Field]
		if !ok {
			continue
		}
		var provider string
		if err := json.Unmarshal(raw, &provider); err != nil || provider == "" {
			return plan.InstallRequest{}, fmt.Errorf("provider field %q must contain a provider id", binding.Field)
		}
		preferences[binding.Capability] = []string{provider}
	}
	return plan.InstallRequest{Schema: "kb.install/1", Source: plan.SourceScenario, CatalogDigest: catalogDigest, ProjectRoot: projectRoot, PlatformRoot: platformRoot, Components: components, Effects: effects, ProviderPreferences: preferences, Values: state.Values}, nil
}
