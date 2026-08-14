// Package contracts contains the versioned V2 launcher boundary shared by
// humans, CI, agents, resolver, engine adapters and recovery tooling.
package contracts

import (
	"fmt"
	"sort"
)

const RequestSchema = "kb.create/v2"

type Channel string

const (
	ChannelStable       Channel = "stable"
	ChannelCanary       Channel = "canary"
	ChannelExperimental Channel = "experimental"
)

type CompatibilityPolicy string

const (
	PolicyStrict      CompatibilityPolicy = "strict"
	PolicyCompatible  CompatibilityPolicy = "compatible"
	PolicyUpgradeSafe CompatibilityPolicy = "upgrade-safe"
)

type ArtifactSource string

const (
	SourceRegistry ArtifactSource = "registry"
	SourceOffline  ArtifactSource = "offline"
)

// VersionSelector identifies an artifact by an immutable version or a
// channel. Resolver output always contains an immutable version and hash.
type VersionSelector struct {
	Version string  `json:"version,omitempty"`
	Channel Channel `json:"channel,omitempty"`
}

// ComponentRequest is an independently versioned plugin or adapter request.
// Platform services are not components here: they are owned by the selected
// platform bundle and resolved from its release manifest.
type ComponentRequest struct {
	ID      string          `json:"id"`
	Version VersionSelector `json:"version,omitempty"`
}

// InstallRequest is deliberately transport-neutral. Wizard answers, CI flags,
// agent protocol messages and scenario files all normalize to this type before
// resolution. Values only carry non-secret input; secret input is referenced by
// key and retrieved through the engine's secret store at apply time.
type InstallRequest struct {
	Schema              string              `json:"schema"`
	Platform            VersionSelector     `json:"platform"`
	SDK                 VersionSelector     `json:"sdk,omitempty"`
	ServiceProfile      string              `json:"serviceProfile,omitempty"`
	Plugins             []ComponentRequest  `json:"plugins,omitempty"`
	Adapters            []ComponentRequest  `json:"adapters,omitempty"`
	ProviderPreferences map[string]string   `json:"providerPreferences,omitempty"`
	Values              map[string]string   `json:"values,omitempty"`
	SecretInputs        []string            `json:"secretInputs,omitempty"`
	Policy              CompatibilityPolicy `json:"policy"`
	Source              ArtifactSource      `json:"source"`
	ScenarioID          string              `json:"scenarioId,omitempty"`
	// ScenarioStateDigest is a non-secret checksum of persisted scenario
	// answers. It is provenance only: the resolver never treats it as input.
	ScenarioStateDigest string `json:"scenarioStateDigest,omitempty"`
	PlatformRoot        string `json:"platformRoot"`
	ProjectRoot         string `json:"projectRoot,omitempty"`
}

func (r InstallRequest) Normalize() (InstallRequest, error) {
	if r.Schema == "" {
		r.Schema = RequestSchema
	}
	if r.Schema != RequestSchema {
		return InstallRequest{}, fmt.Errorf("unsupported request schema %q", r.Schema)
	}
	if r.Platform.Version == "" && r.Platform.Channel == "" {
		r.Platform.Channel = ChannelStable
	}
	if err := validateSelector("platform", r.Platform); err != nil {
		return InstallRequest{}, err
	}
	if err := validateSelector("sdk", r.SDK); err != nil {
		return InstallRequest{}, err
	}
	if r.Policy == "" {
		r.Policy = PolicyStrict
	}
	if r.Policy != PolicyStrict && r.Policy != PolicyCompatible && r.Policy != PolicyUpgradeSafe {
		return InstallRequest{}, fmt.Errorf("unsupported compatibility policy %q", r.Policy)
	}
	if r.Source == "" {
		r.Source = SourceRegistry
	}
	if r.Source != SourceRegistry && r.Source != SourceOffline {
		return InstallRequest{}, fmt.Errorf("unsupported artifact source %q", r.Source)
	}
	if r.PlatformRoot == "" {
		return InstallRequest{}, fmt.Errorf("platform root is required")
	}
	plugins, err := normalizeComponents("plugin", r.Plugins)
	if err != nil {
		return InstallRequest{}, err
	}
	adapters, err := normalizeComponents("adapter", r.Adapters)
	if err != nil {
		return InstallRequest{}, err
	}
	r.Plugins = plugins
	r.Adapters = adapters
	r.SecretInputs = uniqueSorted(r.SecretInputs)
	for _, key := range r.SecretInputs {
		delete(r.Values, key)
	}
	return r, nil
}

func validateSelector(name string, selector VersionSelector) error {
	if selector.Version != "" && selector.Channel != "" {
		return fmt.Errorf("%s cannot specify both version and channel", name)
	}
	if selector.Channel != "" && selector.Channel != ChannelStable && selector.Channel != ChannelCanary && selector.Channel != ChannelExperimental {
		return fmt.Errorf("unsupported %s channel %q", name, selector.Channel)
	}
	return nil
}

func normalizeComponents(kind string, components []ComponentRequest) ([]ComponentRequest, error) {
	seen := make(map[string]struct{}, len(components))
	result := make([]ComponentRequest, 0, len(components))
	for _, component := range components {
		if component.ID == "" {
			return nil, fmt.Errorf("%s ID is required", kind)
		}
		if _, exists := seen[component.ID]; exists {
			return nil, fmt.Errorf("duplicate %s %q", kind, component.ID)
		}
		if err := validateSelector(kind+" "+component.ID, component.Version); err != nil {
			return nil, err
		}
		seen[component.ID] = struct{}{}
		result = append(result, component)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].ID < result[j].ID })
	return result, nil
}

func uniqueSorted(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		if value != "" {
			seen[value] = struct{}{}
		}
	}
	result := make([]string, 0, len(seen))
	for value := range seen {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}
