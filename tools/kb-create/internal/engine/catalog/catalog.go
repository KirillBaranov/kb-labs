// Package catalog contains the normalized input for the declarative engine.
// It is deliberately independent from the legacy manifest package; the
// compiler will later adapt emitted package manifests into these contracts.
package catalog

import (
	"fmt"
	"sort"

	engineconfig "github.com/kb-labs/create/internal/engine/config"
)

type Requirement struct {
	Capability string   `json:"capability"`
	Features   []string `json:"features,omitempty"`
}

type Component struct {
	ID        string                     `json:"id"`
	Kind      string                     `json:"kind"`
	Package   string                     `json:"package"`
	Default   bool                       `json:"default,omitempty"`
	Requires  []Requirement              `json:"requires,omitempty"`
	DependsOn []string                   `json:"dependsOn,omitempty"`
	Config    []engineconfig.ConfigPatch `json:"config,omitempty"`
}

type Provider struct {
	ID         string                     `json:"id"`
	Capability string                     `json:"capability"`
	Features   []string                   `json:"features,omitempty"`
	Package    string                     `json:"package"`
	Config     []engineconfig.ConfigPatch `json:"config,omitempty"`
}

type Catalog struct {
	Core       []string                    `json:"core,omitempty"`
	Digest     string                      `json:"digest"`
	Defaults   []engineconfig.ConfigPatch  `json:"defaults,omitempty"`
	Components []Component                 `json:"components"`
	Providers  []Provider                  `json:"providers"`
	Outputs    []engineconfig.ConfigOutput `json:"outputs,omitempty"`
}

func (c Catalog) Component(id string) (Component, bool) {
	for _, item := range c.Components {
		if item.ID == id {
			return item, true
		}
	}
	return Component{}, false
}

func (c Catalog) Provider(id string) (Provider, bool) {
	for _, item := range c.Providers {
		if item.ID == id {
			return item, true
		}
	}
	return Provider{}, false
}

func (c Catalog) Validate() error {
	for _, packageSpec := range c.Core {
		if packageSpec == "" {
			return fmt.Errorf("core package cannot be empty")
		}
	}
	seenComponents := make(map[string]struct{}, len(c.Components))
	for _, component := range c.Components {
		if component.ID == "" || component.Kind == "" || component.Package == "" {
			return fmt.Errorf("component requires id, kind, and package")
		}
		if _, ok := seenComponents[component.ID]; ok {
			return fmt.Errorf("duplicate component %q", component.ID)
		}
		seenComponents[component.ID] = struct{}{}
	}
	seenProviders := make(map[string]struct{}, len(c.Providers))
	for _, provider := range c.Providers {
		if provider.ID == "" || provider.Capability == "" || provider.Package == "" {
			return fmt.Errorf("provider requires id, capability, and package")
		}
		if _, ok := seenProviders[provider.ID]; ok {
			return fmt.Errorf("duplicate provider %q", provider.ID)
		}
		seenProviders[provider.ID] = struct{}{}
	}
	return nil
}

func SortedIDs(items []string) []string {
	result := append([]string(nil), items...)
	sort.Strings(result)
	return result
}

func HasFeatures(provider Provider, required []string) bool {
	available := make(map[string]bool, len(provider.Features))
	for _, feature := range provider.Features {
		available[feature] = true
	}
	for _, feature := range required {
		if !available[feature] {
			return false
		}
	}
	return true
}
