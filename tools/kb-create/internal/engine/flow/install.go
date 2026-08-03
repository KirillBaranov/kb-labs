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
	if state.ScenarioID != scenario.ID {
		return plan.InstallRequest{}, fmt.Errorf("state belongs to scenario %q, want %q", state.ScenarioID, scenario.ID)
	}
	install := scenario.Install
	if install == nil {
		install = &InstallSpec{ProviderPreferences: append([]ProviderBinding(nil), scenario.Selection.ProviderPreferences...)}
		for _, component := range scenario.Selection.Components {
			install.Components = append(install.Components, ComponentBinding{ID: component})
		}
	}
	components := make([]string, 0, len(install.Components))
	for _, binding := range install.Components {
		if binding.ID == "" {
			return plan.InstallRequest{}, fmt.Errorf("scenario has an empty component binding")
		}
		if binding.When == nil || binding.When.Evaluate(state.Values) {
			components = append(components, binding.ID)
		}
	}
	effects := make([]string, 0, len(install.Effects))
	for _, binding := range install.Effects {
		if binding.ID == "" {
			return plan.InstallRequest{}, fmt.Errorf("scenario has an empty effect binding")
		}
		if binding.When == nil || binding.When.Evaluate(state.Values) {
			effects = append(effects, binding.ID)
		}
	}
	for _, page := range scenario.Pages {
		for _, section := range page.Sections {
			for _, field := range section.Fields {
				raw, ok := state.Values[field.ID]
				if !ok {
					continue
				}
				var selected string
				if err := json.Unmarshal(raw, &selected); err != nil {
					continue
				}
				for _, option := range field.Options {
					if option.Value == selected {
						effects = append(effects, option.Effects...)
					}
				}
			}
		}
	}
	effects = uniqueStrings(effects)
	sort.Strings(effects)
	sort.Strings(components)
	preferences := make(map[string][]string)
	for _, binding := range install.ProviderPreferences {
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
	values := make(map[string]json.RawMessage, len(state.Values))
	for _, page := range scenario.Pages {
		for _, section := range page.Sections {
			for _, field := range section.Fields {
				if field.Secret {
					continue
				}
				if value, ok := state.Values[field.ID]; ok {
					values[field.ID] = append(json.RawMessage(nil), value...)
				}
			}
		}
	}
	return plan.InstallRequest{Schema: "kb.install/1", Source: plan.SourceScenario, ScenarioID: scenario.ID, CatalogDigest: catalogDigest, ProjectRoot: projectRoot, PlatformRoot: platformRoot, Components: components, Effects: effects, ProviderPreferences: preferences, Values: values}, nil
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}
