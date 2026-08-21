package catalog

import (
	"encoding/json"
	"fmt"
	"strings"

	engineconfig "github.com/kb-labs/create/internal/engine/config"
	"github.com/kb-labs/create/internal/engine/migrate"
	"github.com/kb-labs/create/internal/manifest"
)

// FromManifest adapts the current JSON manifest into the declarative engine's
// normalized catalog. The manifest remains the source of component identity;
// this function only changes representation and never invents compatibility.
func FromManifest(source manifest.Manifest) (Catalog, error) {
	foundation := append(source.CorePackageSpecs(), source.AdapterPackageSpecs()...)
	catalog := Catalog{Core: foundation, Components: make([]Component, 0, len(source.Services)+len(source.Plugins)), Effects: make([]Effect, 0, len(source.Effects)), Migrations: make([]migrate.Definition, 0, len(source.Migrations))}
	for _, output := range source.Outputs {
		catalog.Outputs = append(catalog.Outputs, engineconfig.ConfigOutput{Scope: engineconfig.ConfigScope(output.Scope), Root: engineconfig.Root(output.Root), Path: output.Path, Format: engineconfig.Format(output.Format), Overwrite: engineconfig.OverwritePolicy(output.Overwrite)})
	}
	for _, artifact := range source.Artifacts {
		catalog.Artifacts = append(catalog.Artifacts, engineconfig.ArtifactWrite{ID: artifact.ID, Root: engineconfig.Root(artifact.Root), Path: artifact.Path, Format: engineconfig.Format(artifact.Format), Content: append(json.RawMessage(nil), artifact.Content...), Text: artifact.Text, Owner: artifact.Owner, Overwrite: engineconfig.OverwritePolicy(artifact.Overwrite), Required: true})
	}
	for _, patch := range source.Defaults {
		catalog.Defaults = append(catalog.Defaults, convertPatch(patch, "catalog:default"))
	}
	for _, service := range source.Services {
		if service.ID == "" || service.Pkg == "" {
			return Catalog{}, fmt.Errorf("service requires id and package")
		}
		id := canonicalComponentID("service", service.ID)
		componentConfig := []engineconfig.ConfigPatch{togglePatch("service", service.ID, true, id)}
		for _, patch := range service.Config {
			componentConfig = append(componentConfig, convertPatch(patch, id))
		}
		companionPackages := []string(nil)
		if service.Plugin != "" {
			companion := service.Plugin
			if service.PluginVersion != "" {
				companion += "@" + service.PluginVersion
			}
			companionPackages = []string{companion}
		}
		catalog.Components = append(catalog.Components, Component{ID: id, Kind: "service", Package: service.Pkg, CompanionPackages: companionPackages, Default: service.Default, Config: componentConfig})
	}
	for _, plugin := range source.Plugins {
		if plugin.ID == "" || plugin.Pkg == "" {
			return Catalog{}, fmt.Errorf("plugin requires id and package")
		}
		id := canonicalComponentID("plugin", plugin.ID)
		componentConfig := []engineconfig.ConfigPatch{togglePatch("plugin", plugin.ID, true, id)}
		for _, patch := range plugin.Config {
			componentConfig = append(componentConfig, convertPatch(patch, id))
		}
		catalog.Components = append(catalog.Components, Component{ID: id, Kind: "plugin", Package: plugin.Pkg, Default: plugin.Default, Config: componentConfig})
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
	for _, effect := range source.Effects {
		converted := Effect{ID: effect.ID, Config: make([]engineconfig.ConfigPatch, 0, len(effect.Config))}
		for _, patch := range effect.Config {
			converted.Config = append(converted.Config, convertPatch(patch, "catalog:effect/"+effect.ID))
		}
		catalog.Effects = append(catalog.Effects, converted)
	}
	for _, definition := range source.Migrations {
		converted := migrate.Definition{ID: definition.ID, Subject: definition.Subject, From: definition.From, To: definition.To, Fingerprint: definition.Fingerprint, Operations: make([]migrate.Operation, 0, len(definition.Operations))}
		for _, predicate := range definition.Detect {
			converted.Detect = append(converted.Detect, convertMigrationPredicate(predicate))
		}
		for _, operation := range definition.Operations {
			item := migrate.Operation{Kind: operation.Kind, Path: operation.Path, From: operation.From, Value: append(json.RawMessage(nil), operation.Value...), Mapping: operation.Mapping}
			if operation.When != nil {
				predicate := convertMigrationPredicate(*operation.When)
				item.Predicate = &predicate
			}
			converted.Operations = append(converted.Operations, item)
		}
		catalog.Migrations = append(catalog.Migrations, converted)
	}
	catalog = Normalize(catalog)
	catalog.Digest = Digest(catalog)
	if err := catalog.Validate(); err != nil {
		return Catalog{}, err
	}
	return catalog, nil
}

func convertPatch(patch manifest.ConfigPatch, fallbackOwner string) engineconfig.ConfigPatch {
	owner := patch.Owner
	if owner == "" {
		owner = fallbackOwner
	}
	return engineconfig.ConfigPatch{ID: patch.ID, Scope: engineconfig.ConfigScope(patch.Scope), Operation: engineconfig.Operation(patch.Operation), Path: patch.Path, Value: append(json.RawMessage(nil), patch.Value...), SchemaRef: patch.SchemaRef, Owner: owner}
}

func convertMigrationPredicate(source manifest.MigrationPredicate) migrate.Predicate {
	result := migrate.Predicate{Path: source.Path, Exists: source.Exists, Equals: append(json.RawMessage(nil), source.Equals...), Type: source.Type, Not: nil}
	for _, child := range source.AllOf {
		result.AllOf = append(result.AllOf, convertMigrationPredicate(child))
	}
	for _, child := range source.AnyOf {
		result.AnyOf = append(result.AnyOf, convertMigrationPredicate(child))
	}
	if source.Not != nil {
		predicate := convertMigrationPredicate(*source.Not)
		result.Not = &predicate
	}
	return result
}

func canonicalComponentID(kind, id string) string { return kind + ":" + id }

func togglePatch(kind, id string, enabled bool, owner string) engineconfig.ConfigPatch {
	value := "false"
	if enabled {
		value = "true"
	}
	path := "/" + kind + "s/" + id + "/enabled"
	if kind == "service" {
		// Platform configs render service toggles as scalar booleans, while
		// plugin entries are objects with an enabled field.
		path = "/services/" + id
	}
	return engineconfig.ConfigPatch{ID: kind + "." + id + ".enabled", Scope: engineconfig.ScopePlatform, Operation: engineconfig.OperationSet, Path: path, Value: json.RawMessage(value), Owner: owner}
}
