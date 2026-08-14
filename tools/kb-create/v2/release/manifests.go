// Package release builds a pre-install release projection from the V2
// manifests shipped by exact artifacts. This belongs to publisher tooling,
// not to the launcher runtime: users never need packages installed merely to
// discover which variables the wizard may ask for.
package release

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/kb-labs/create/v2/catalog"
	"github.com/kb-labs/create/v2/contracts"
	"github.com/kb-labs/create/v2/doctor"
	"github.com/kb-labs/create/v2/installed"
)

// HydrateArtifacts replaces the intentionally omitted immutable artifact
// fields in a reviewed topology with the names, versions and byte hashes from
// the exact `kb release stage` output. The topology may describe product
// composition, but it must never hand-write a package version or checksum.
func HydrateArtifacts(source catalog.Catalog, stageManifest string) (catalog.Catalog, error) {
	data, err := os.ReadFile(stageManifest)
	if err != nil {
		return catalog.Catalog{}, fmt.Errorf("read staged artifact manifest: %w", err)
	}
	var staged []StagedArtifact
	if err := json.Unmarshal(data, &staged); err != nil {
		return catalog.Catalog{}, fmt.Errorf("decode staged artifact manifest: %w", err)
	}
	byPackage := make(map[string]StagedArtifact, len(staged))
	for _, item := range staged {
		if item.Name == "" || item.Version == "" || item.Tarball == "" || item.SHA256 == "" {
			return catalog.Catalog{}, fmt.Errorf("staged artifact must declare name, version, tarball and sha256")
		}
		if _, exists := byPackage[item.Name]; exists {
			return catalog.Catalog{}, fmt.Errorf("duplicate staged package %s", item.Name)
		}
		byPackage[item.Name] = item
	}
	hydrate := func(component *catalog.Component) error {
		item, exists := byPackage[component.Package]
		if !exists {
			return fmt.Errorf("launcher topology package %s was not staged", component.Package)
		}
		component.Version, component.Tarball, component.SHA256 = item.Version, item.Tarball, item.SHA256
		return nil
	}
	for i := range source.Platforms {
		platform := &source.Platforms[i]
		component := catalog.Component{ID: platform.ID, Package: platform.Package}
		if err := hydrate(&component); err != nil {
			return catalog.Catalog{}, err
		}
		platform.Version, platform.Tarball, platform.SHA256 = component.Version, component.Tarball, component.SHA256
		for j := range platform.Members {
			if err := hydrate(&platform.Members[j]); err != nil {
				return catalog.Catalog{}, err
			}
		}
	}
	for i := range source.SDKs {
		if err := hydrate(&source.SDKs[i]); err != nil {
			return catalog.Catalog{}, err
		}
	}
	for i := range source.Plugins {
		if err := hydrate(&source.Plugins[i]); err != nil {
			return catalog.Catalog{}, err
		}
	}
	for i := range source.Adapters {
		if err := hydrate(&source.Adapters[i].Component); err != nil {
			return catalog.Catalog{}, err
		}
	}
	for channel, version := range source.Channels {
		if version != "$platform" {
			continue
		}
		if len(source.Platforms) != 1 {
			return catalog.Catalog{}, fmt.Errorf("channel %q uses $platform but topology declares %d platforms", channel, len(source.Platforms))
		}
		source.Channels[channel] = source.Platforms[0].Version
	}
	for channel, version := range source.SDKChannels {
		if version != "$sdk" {
			continue
		}
		if len(source.SDKs) != 1 {
			return catalog.Catalog{}, fmt.Errorf("SDK channel %q uses $sdk but topology declares %d SDKs", channel, len(source.SDKs))
		}
		source.SDKChannels[channel] = source.SDKs[0].Version
	}
	return source, nil
}

// EnrichWithManifests reads each package exactly once and replaces any
// hand-written configuration projection in the release export. Package,
// component id and version must match, otherwise publishing fails closed.
func EnrichWithManifests(source catalog.Catalog, manifestRoot string) (catalog.Catalog, error) {
	if manifestRoot == "" {
		return catalog.Catalog{}, fmt.Errorf("V2 manifest root is required")
	}
	var err error
	for i := range source.Platforms {
		item := &source.Platforms[i]
		manifest, loadErr := manifestFor(manifestRoot, item.ID, item.Package, item.Version)
		if loadErr != nil {
			return catalog.Catalog{}, loadErr
		}
		item.Config, err = requirements(manifest.Requirements)
		if err != nil {
			return catalog.Catalog{}, err
		}
		services := append([]contracts.Service(nil), manifest.Services...)
		for j := range item.Members {
			member := &item.Members[j]
			memberManifest, memberErr := manifestFor(manifestRoot, member.ID, member.Package, member.Version)
			if memberErr != nil {
				return catalog.Catalog{}, memberErr
			}
			member.Config, err = requirements(memberManifest.Requirements)
			if err != nil {
				return catalog.Catalog{}, err
			}
			services = append(services, memberManifest.Services...)
		}
		if err := applyServices(item, services); err != nil {
			return catalog.Catalog{}, err
		}
	}
	for i := range source.SDKs {
		item := &source.SDKs[i]
		item.Config, err = configFor(manifestRoot, item.ID, item.Package, item.Version)
		if err != nil {
			return catalog.Catalog{}, err
		}
	}
	for i := range source.Plugins {
		item := &source.Plugins[i]
		item.Config, err = configFor(manifestRoot, item.ID, item.Package, item.Version)
		if err != nil {
			return catalog.Catalog{}, err
		}
	}
	for i := range source.Adapters {
		item := &source.Adapters[i]
		item.Config, err = configFor(manifestRoot, item.ID, item.Package, item.Version)
		if err != nil {
			return catalog.Catalog{}, err
		}
	}
	return source, nil
}

func configFor(root, id, pkg, version string) ([]catalog.ConfigRequirement, error) {
	manifest, err := manifestFor(root, id, pkg, version)
	if err != nil {
		return nil, err
	}
	return requirements(manifest.Requirements)
}

func manifestFor(root, id, pkg, version string) (installed.Manifest, error) {
	return installed.Load(root, artifact(id, pkg, version))
}

// applyServices binds topology-selected service IDs to their command, port
// and dependencies from exact package manifests. The topology decides which
// services a profile contains; service packages decide how those services
// actually run. Thus an old monorepo command can never leak into a clean
// installation by accident.
func applyServices(platform *catalog.PlatformBundle, declarations []contracts.Service) error {
	byID := make(map[string]contracts.Service, len(declarations))
	for _, service := range declarations {
		if service.ID == "" || service.Command == "" {
			return fmt.Errorf("package manifest has incomplete service declaration")
		}
		if prior, exists := byID[service.ID]; exists && (prior.Command != service.Command || prior.Port != service.Port) {
			return fmt.Errorf("service %s is declared inconsistently by selected package manifests", service.ID)
		}
		byID[service.ID] = service
	}
	for profile, graph := range platform.Profiles {
		for index, selected := range graph.Services {
			declared, exists := byID[selected.ID]
			if !exists {
				return fmt.Errorf("profile %s selects service %s but no selected package manifest declares it", profile, selected.ID)
			}
			if selected.Command != "" && selected.Command != declared.Command {
				return fmt.Errorf("profile %s hand-writes command for service %s", profile, selected.ID)
			}
			graph.Services[index] = declared
		}
		platform.Profiles[profile] = graph
	}
	return nil
}

func artifact(id, pkg, version string) contracts.Artifact {
	return contracts.Artifact{ID: id, Package: pkg, Version: version}
}

func requirements(items []doctor.Requirement) ([]catalog.ConfigRequirement, error) {
	result := make([]catalog.ConfigRequirement, 0, len(items))
	for _, item := range items {
		if item.Secret && (item.Env == "" || len(item.Services) == 0) {
			return nil, fmt.Errorf("secret manifest requirement %s must declare env and services", item.ID)
		}
		if item.Secret && len(item.Default) != 0 {
			return nil, fmt.Errorf("secret manifest requirement %s must not declare a default", item.ID)
		}
		defaultValue := ""
		if len(item.Default) != 0 {
			if !json.Valid(item.Default) {
				return nil, fmt.Errorf("manifest requirement %s has invalid JSON default", item.ID)
			}
			defaultValue = string(item.Default)
		}
		result = append(result, catalog.ConfigRequirement{ID: item.ID, Path: item.Path, Required: item.Required, Secret: item.Secret, Default: defaultValue, Env: item.Env, Services: append([]string(nil), item.Services...)})
	}
	return result, nil
}

// PackagePath documents the staging layout consumed by the release command.
// Keeping the package namespace in the path matches pnpm's installed layout.
func PackagePath(root, pkg string) string {
	return filepath.Join(root, "node_modules", filepath.FromSlash(pkg))
}
