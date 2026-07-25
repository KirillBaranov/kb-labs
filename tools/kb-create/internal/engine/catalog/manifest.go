package catalog

import (
	"encoding/json"
	"fmt"
	"strings"

	engineconfig "github.com/kb-labs/create/internal/engine/config"
	"github.com/kb-labs/create/internal/manifest"
)

// FromManifest adapts the current JSON manifest into the declarative engine's
// normalized catalog. The manifest remains the source of component identity;
// this function only changes representation and never invents compatibility.
func FromManifest(source manifest.Manifest) (Catalog, error) {
	foundation := append(source.CorePackageSpecs(), source.AdapterPackageSpecs()...)
	catalog := Catalog{Core: foundation, Components: make([]Component, 0, len(source.Services)+len(source.Plugins)), Outputs: []engineconfig.ConfigOutput{{Scope: engineconfig.ScopePlatform, Root: engineconfig.RootPlatform, Path: ".kb/kb.config.jsonc", Format: engineconfig.FormatJSONC}, {Scope: engineconfig.ScopeProject, Root: engineconfig.RootProject, Path: ".kb/kb.config.jsonc", Format: engineconfig.FormatJSONC}}, Defaults: []engineconfig.ConfigPatch{{ID: "platform.execution.mode", Scope: engineconfig.ScopePlatform, Operation: engineconfig.OperationSet, Path: "/platform/execution/mode", Value: json.RawMessage(`"worker-pool"`), Owner: "kb-create"}, {ID: "adapterOptions.serviceTransport.services", Scope: engineconfig.ScopePlatform, Operation: engineconfig.OperationSet, Path: "/adapterOptions/serviceTransport/services", Value: json.RawMessage(`{}`), Owner: "kb-create"}}}
	for _, service := range source.Services {
		if service.ID == "" || service.Pkg == "" {
			return Catalog{}, fmt.Errorf("service requires id and package")
		}
		id := canonicalComponentID("service", service.ID)
		catalog.Defaults = append(catalog.Defaults, togglePatch("service", service.ID, false, "kb-create"))
		catalog.Components = append(catalog.Components, Component{ID: id, Kind: "service", Package: service.Pkg, Default: service.Default, Config: []engineconfig.ConfigPatch{togglePatch("service", service.ID, true, id)}})
	}
	for _, plugin := range source.Plugins {
		if plugin.ID == "" || plugin.Pkg == "" {
			return Catalog{}, fmt.Errorf("plugin requires id and package")
		}
		id := canonicalComponentID("plugin", plugin.ID)
		catalog.Defaults = append(catalog.Defaults, togglePatch("plugin", plugin.ID, false, "kb-create"))
		catalog.Components = append(catalog.Components, Component{ID: id, Kind: "plugin", Package: plugin.Pkg, Default: plugin.Default, Config: []engineconfig.ConfigPatch{togglePatch("plugin", plugin.ID, true, id)}})
	}
	if source.AdapterConfig != nil {
		for capability, packageSpec := range source.AdapterConfig.Adapters {
			if strings.TrimSpace(capability) == "" || strings.TrimSpace(packageSpec) == "" {
				return Catalog{}, fmt.Errorf("adapter provider requires capability and package")
			}
			catalog.Providers = append(catalog.Providers, Provider{ID: capability, Capability: capability, Package: packageSpec})
			value, _ := json.Marshal(packageSpec)
			catalog.Defaults = append(catalog.Defaults, engineconfig.ConfigPatch{ID: "adapter." + capability, Scope: engineconfig.ScopePlatform, Operation: engineconfig.OperationSet, Path: "/platform/adapters/" + capability, Value: value, Owner: "kb-create"})
		}
	}
	catalog = Normalize(catalog)
	catalog.Digest = Digest(catalog)
	if err := catalog.Validate(); err != nil {
		return Catalog{}, err
	}
	return catalog, nil
}

func canonicalComponentID(kind, id string) string { return kind + ":" + id }

func togglePatch(kind, id string, enabled bool, owner string) engineconfig.ConfigPatch {
	value := "false"
	if enabled {
		value = "true"
	}
	return engineconfig.ConfigPatch{ID: kind + "." + id + ".enabled", Scope: engineconfig.ScopePlatform, Operation: engineconfig.OperationSet, Path: "/" + kind + "s/" + id + "/enabled", Value: json.RawMessage(value), Owner: owner}
}
