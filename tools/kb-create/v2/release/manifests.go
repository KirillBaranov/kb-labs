// Package release builds a pre-install release projection from the V2
// manifests shipped by exact artifacts. This belongs to publisher tooling,
// not to the launcher runtime: users never need packages installed merely to
// discover which variables the wizard may ask for.
package release

import (
	"encoding/json"
	"fmt"
	"path/filepath"

	"github.com/kb-labs/create/v2/catalog"
	"github.com/kb-labs/create/v2/contracts"
	"github.com/kb-labs/create/v2/doctor"
	"github.com/kb-labs/create/v2/installed"
)

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
		item.Config, err = configFor(manifestRoot, item.ID, item.Package, item.Version)
		if err != nil {
			return catalog.Catalog{}, err
		}
		for j := range item.Members {
			member := &item.Members[j]
			member.Config, err = configFor(manifestRoot, member.ID, member.Package, member.Version)
			if err != nil {
				return catalog.Catalog{}, err
			}
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
	manifest, err := installed.Load(root, artifact(id, pkg, version))
	if err != nil {
		return nil, err
	}
	return requirements(manifest.Requirements)
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
