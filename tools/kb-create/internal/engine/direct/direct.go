// Package direct compiles the non-interactive CI input into the shared
// InstallRequest. It intentionally has no scenario dependency.
package direct

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/kb-labs/create/internal/engine/catalog"
	"github.com/kb-labs/create/internal/engine/plan"
)

type Config struct {
	Plugins  []string                   `json:"plugins,omitempty"`
	Services []string                   `json:"services,omitempty"`
	Effects  []string                   `json:"effects,omitempty"`
	Adapters map[string]string          `json:"adapters,omitempty"`
	Values   map[string]json.RawMessage `json:"values,omitempty"`
}

type Input struct {
	// A non-nil list means the corresponding flag was explicitly supplied,
	// including an explicit empty list. This preserves flags > config > defaults.
	Plugins          *[]string
	Services         *[]string
	Adapters         map[string]string
	Config           []byte
	ProjectRoot      string
	PlatformRoot     string
	CatalogDigest    string
	Binaries         []string
	PackageOverrides map[string]string
}

func Build(input Input, source catalog.Catalog) (plan.InstallRequest, error) {
	if err := source.Validate(); err != nil {
		return plan.InstallRequest{}, fmt.Errorf("catalog: %w", err)
	}
	var file Config
	if len(input.Config) > 0 {
		if err := json.Unmarshal(input.Config, &file); err != nil {
			return plan.InstallRequest{}, fmt.Errorf("decode direct config: %w", err)
		}
	}
	plugins := choose(input.Plugins, file.Plugins, defaults(source, "plugin"))
	services := choose(input.Services, file.Services, defaults(source, "service"))
	components := make([]string, 0, len(plugins)+len(services))
	components = append(components, plugins...)
	components = append(components, services...)
	components = catalog.SortedIDs(components)
	for _, id := range components {
		component, ok := source.Component(id)
		if !ok {
			return plan.InstallRequest{}, fmt.Errorf("unknown direct component %q", id)
		}
		if component.Kind != "plugin" && component.Kind != "service" {
			return plan.InstallRequest{}, fmt.Errorf("component %q cannot be selected as plugin/service", id)
		}
	}
	preferences := make(map[string][]string)
	for capability, provider := range file.Adapters {
		preferences[capability] = []string{provider}
	}
	for capability, provider := range input.Adapters {
		preferences[capability] = []string{provider}
	}
	return plan.InstallRequest{
		Schema:              "kb.install/1",
		Source:              plan.SourceDirect,
		CatalogDigest:       input.CatalogDigest,
		ProjectRoot:         input.ProjectRoot,
		PlatformRoot:        input.PlatformRoot,
		Components:          components,
		Binaries:            append([]string(nil), input.Binaries...),
		Effects:             append([]string(nil), file.Effects...),
		ProviderPreferences: preferences,
		PackageOverrides:    cloneStringMap(input.PackageOverrides),
		Values:              file.Values,
	}, nil
}

func cloneStringMap(input map[string]string) map[string]string {
	if len(input) == 0 {
		return nil
	}
	out := make(map[string]string, len(input))
	for key, value := range input {
		out[key] = value
	}
	return out
}

func choose(flag *[]string, config, fallback []string) []string {
	if flag != nil {
		return append([]string(nil), (*flag)...)
	}
	if config != nil {
		return append([]string(nil), config...)
	}
	return append([]string(nil), fallback...)
}

func defaults(source catalog.Catalog, kind string) []string {
	ids := make([]string, 0)
	for _, component := range source.Components {
		if component.Kind == kind && component.Default {
			ids = append(ids, component.ID)
		}
	}
	sort.Strings(ids)
	return ids
}
