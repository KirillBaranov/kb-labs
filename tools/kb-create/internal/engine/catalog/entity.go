package catalog

import (
	"encoding/json"
	"fmt"
	"sort"

	engineconfig "github.com/kb-labs/create/internal/engine/config"
)

// EntityKind is the package-level kind understood by the installer resolver.
type EntityKind string

const (
	KindPlugin  EntityKind = "plugin"
	KindService EntityKind = "service"
	KindAdapter EntityKind = "adapter"
)

// EntityManifest is the normalized technical contract consumed by planning.
// The source remains the package's own manifest; this type is only a stable
// engine representation across kb.plugin, kb.service, and AdapterManifest.
type EntityManifest struct {
	Schema       string                 `json:"schema"`
	Kind         EntityKind             `json:"kind"`
	ID           string                 `json:"id"`
	Package      string                 `json:"package"`
	Version      string                 `json:"version"`
	Implements   []string               `json:"implements,omitempty"`
	Capabilities []string               `json:"capabilities,omitempty"`
	Requires     []Requirement          `json:"requires,omitempty"`
	Optional     []Requirement          `json:"optional,omitempty"`
	ConfigSchema map[string]ConfigField `json:"configSchema,omitempty"`
	Secrets      []SecretRequirement    `json:"secrets,omitempty"`
	Commands     []Command              `json:"commands,omitempty"`
	Raw          json.RawMessage        `json:"raw,omitempty"`
}

type ConfigField struct {
	Type        string          `json:"type,omitempty"`
	Description string          `json:"description,omitempty"`
	Default     json.RawMessage `json:"default,omitempty"`
	Secret      bool            `json:"secret,omitempty"`
}

type SecretRequirement struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Required    bool   `json:"required,omitempty"`
}

type Command struct {
	Path        string `json:"path"`
	Description string `json:"description,omitempty"`
}

func (m EntityManifest) Validate() error {
	if m.Schema == "" || m.ID == "" || m.Kind == "" || m.Package == "" || m.Version == "" {
		return fmt.Errorf("entity manifest requires schema, kind, id, package, and version")
	}
	switch m.Kind {
	case KindPlugin, KindService, KindAdapter:
	default:
		return fmt.Errorf("unsupported entity kind %q", m.Kind)
	}
	for _, requirement := range append(append([]Requirement(nil), m.Requires...), m.Optional...) {
		if requirement.Capability == "" {
			return fmt.Errorf("entity %q has an empty requirement capability", m.ID)
		}
	}
	return nil
}

func (m EntityManifest) ComponentID() string {
	return string(m.Kind) + ":" + m.ID
}

func (m EntityManifest) ProviderFeatures() []string {
	features := append([]string(nil), m.Capabilities...)
	sort.Strings(features)
	return features
}

func (m EntityManifest) ToComponent() (Component, error) {
	if err := m.Validate(); err != nil {
		return Component{}, err
	}
	return Component{ID: m.ComponentID(), Kind: string(m.Kind), Package: m.Package, Requires: append([]Requirement(nil), m.Requires...)}, nil
}

func (m EntityManifest) ToProvider(capability string) (Provider, error) {
	if err := m.Validate(); err != nil {
		return Provider{}, err
	}
	if m.Kind != KindAdapter {
		return Provider{}, fmt.Errorf("entity %q is not an adapter", m.ID)
	}
	if capability == "" {
		return Provider{}, fmt.Errorf("provider capability is empty")
	}
	return Provider{ID: m.ID, Capability: capability, Features: m.ProviderFeatures(), Package: m.Package}, nil
}

// AddEntity merges package-owned technical metadata into a catalog. Scenarios
// may still choose which component to install, but requirements and provider
// features now come from the package manifest.
func (c *Catalog) AddEntity(entity EntityManifest) error {
	if c == nil {
		return fmt.Errorf("catalog is nil")
	}
	switch entity.Kind {
	case KindAdapter:
		for _, implementation := range entity.Implements {
			capability := capabilityForInterface(implementation)
			if capability == "" {
				continue
			}
			provider, err := entity.ToProvider(capability)
			if err != nil {
				return err
			}
			merged := false
			for index := range c.Providers {
				if c.Providers[index].Package == provider.Package || c.Providers[index].ID == provider.ID {
					c.Providers[index].Features = append([]string(nil), provider.Features...)
					c.Providers[index].Config = append(c.Providers[index].Config, entity.ConfigPatches(engineconfig.ScopePlatform, capability)...)
					merged = true
				}
			}
			if !merged {
				provider.Config = entity.ConfigPatches(engineconfig.ScopePlatform, capability)
				c.Providers = append(c.Providers, provider)
			}
		}
	default:
		component, err := entity.ToComponent()
		if err != nil {
			return err
		}
		merged := false
		for index := range c.Components {
			if c.Components[index].Package == component.Package {
				component.ID = c.Components[index].ID
				component.Default = c.Components[index].Default
				c.Components[index] = component
				merged = true
			}
		}
		if !merged {
			c.Components = append(c.Components, component)
		}
	}
	c = normalizeCatalog(c)
	return nil
}

func capabilityForInterface(name string) string {
	switch name {
	case "ILLM":
		return "llm"
	case "ICache":
		return "cache"
	case "IStorage":
		return "storage"
	case "ILogger":
		return "logger"
	case "IAnalytics":
		return "analytics"
	case "IServiceTransport":
		return "serviceTransport"
	case "IEmbeddings":
		return "embeddings"
	default:
		return ""
	}
}

func normalizeCatalog(c *Catalog) *Catalog {
	sort.Slice(c.Components, func(i, j int) bool { return c.Components[i].ID < c.Components[j].ID })
	sort.Slice(c.Providers, func(i, j int) bool { return c.Providers[i].ID < c.Providers[j].ID })
	c.Digest = Digest(*c)
	return c
}

// ConfigPatches converts manifest defaults into engine-owned patches. Secrets
// deliberately remain references; their values are never serialized here.
func (m EntityManifest) ConfigPatches(scope engineconfig.ConfigScope, configKey string) []engineconfig.ConfigPatch {
	if configKey == "" {
		return nil
	}
	patches := make([]engineconfig.ConfigPatch, 0, len(m.ConfigSchema))
	for name, field := range m.ConfigSchema {
		if len(field.Default) == 0 || field.Secret {
			continue
		}
		patches = append(patches, engineconfig.ConfigPatch{ID: m.ID + "." + name, Scope: scope, Operation: engineconfig.OperationSet, Path: "/adapterOptions/" + configKey + "/" + name, Value: append(json.RawMessage(nil), field.Default...), Owner: m.Package})
	}
	return patches
}
