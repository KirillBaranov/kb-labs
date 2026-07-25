// Package bootstrap wires the declarative engine to the repository's embedded
// JSON manifest. It is the only bootstrap seam; flow, plan, and executor stay
// independent from manifest loading.
package bootstrap

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/kb-labs/create/internal/engine/catalog"
	"github.com/kb-labs/create/internal/manifest"
)

func DefaultCatalog() (catalog.Catalog, error) {
	source, err := manifest.LoadDefault()
	if err != nil {
		return catalog.Catalog{}, fmt.Errorf("load embedded manifest: %w", err)
	}
	result, err := catalog.FromManifest(*source)
	if err != nil {
		return catalog.Catalog{}, fmt.Errorf("compile embedded manifest: %w", err)
	}
	return result, nil
}

// PackageSpecsForInstall returns the package artifacts needed to enrich the
// embedded product catalog with package-owned compatibility metadata. The
// product manifest supplies stable selection IDs; package manifests supply
// requirements, capabilities, and config schema.
func PackageSpecsForInstall(componentIDs []string) ([]string, error) {
	source, err := manifest.LoadDefault()
	if err != nil {
		return nil, fmt.Errorf("load embedded manifest: %w", err)
	}
	selected := make(map[string]bool, len(componentIDs))
	for _, id := range componentIDs {
		selected[id] = true
	}
	specs := make([]string, 0, len(componentIDs)+len(source.Adapters))
	for _, component := range source.Services {
		if selected["service:"+component.ID] {
			specs = append(specs, component.PackageSpec())
		}
	}
	for _, component := range source.Plugins {
		if selected["plugin:"+component.ID] {
			specs = append(specs, component.PackageSpec())
		}
	}
	specs = append(specs, source.AdapterPackageSpecs()...)
	sort.Strings(specs)
	return uniqueSpecs(specs), nil
}

func uniqueSpecs(specs []string) []string {
	result := make([]string, 0, len(specs))
	seen := make(map[string]struct{}, len(specs))
	for _, spec := range specs {
		if strings.TrimSpace(spec) == "" {
			continue
		}
		if _, ok := seen[spec]; ok {
			continue
		}
		seen[spec] = struct{}{}
		result = append(result, spec)
	}
	return result
}

// CatalogFromPackages overlays technical metadata from exact package
// artifacts onto the bootstrap catalog. This is used for local workspaces and
// post-install verification; package manifests win for requirements/features,
// while bootstrap data retains product defaults and stable component IDs.
func CatalogFromPackages(ctx context.Context, packageDirs []string, options catalog.ResolveOptions) (catalog.Catalog, error) {
	return catalogFromPackages(ctx, packageDirs, options, catalog.ManifestCache{})
}

// CatalogFromPackagesCached is the same overlay path with a persistent cache
// for registry/package-manifest resolution. The cache stores normalized
// manifests and digests only; it never stores secrets or package contents.
func CatalogFromPackagesCached(ctx context.Context, packageDirs []string, options catalog.ResolveOptions, cache catalog.ManifestCache) (catalog.Catalog, error) {
	return catalogFromPackages(ctx, packageDirs, options, cache)
}

// CatalogFromRegistry resolves exact package specs from npm tarballs and
// overlays their declared manifests onto the bootstrap catalog.
func CatalogFromRegistry(ctx context.Context, packageSpecs []string, options catalog.RegistryOptions) (catalog.Catalog, error) {
	result, err := DefaultCatalog()
	if err != nil {
		return catalog.Catalog{}, err
	}
	for _, packageSpec := range packageSpecs {
		resolved, resolveErr := catalog.ResolveRegistryPackage(ctx, packageSpec, options)
		if resolveErr != nil {
			return catalog.Catalog{}, resolveErr
		}
		if addErr := result.AddEntity(resolved.Manifest); addErr != nil {
			return catalog.Catalog{}, addErr
		}
	}
	if err := result.Validate(); err != nil {
		return catalog.Catalog{}, fmt.Errorf("resolved registry catalog: %w", err)
	}
	return result, nil
}

func catalogFromPackages(ctx context.Context, packageDirs []string, options catalog.ResolveOptions, cache catalog.ManifestCache) (catalog.Catalog, error) {
	result, err := DefaultCatalog()
	if err != nil {
		return catalog.Catalog{}, err
	}
	for _, packageDir := range packageDirs {
		var resolved catalog.ResolvedEntity
		var resolveErr error
		if cache.Dir != "" {
			resolved, resolveErr = catalog.ResolvePackageCached(ctx, packageDir, options, cache)
		} else {
			resolved, resolveErr = catalog.ResolvePackage(ctx, packageDir, options)
		}
		if resolveErr != nil {
			return catalog.Catalog{}, resolveErr
		}
		if addErr := result.AddEntity(resolved.Manifest); addErr != nil {
			return catalog.Catalog{}, addErr
		}
	}
	if err := result.Validate(); err != nil {
		return catalog.Catalog{}, fmt.Errorf("resolved catalog: %w", err)
	}
	return result, nil
}
