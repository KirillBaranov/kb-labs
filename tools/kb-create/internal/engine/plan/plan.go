// Package plan resolves a normalized installation request into a deterministic
// action graph. No package manager, filesystem, TTY, or scenario code belongs
// here.
package plan

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/kb-labs/create/internal/engine/catalog"
	engineconfig "github.com/kb-labs/create/internal/engine/config"
)

type Source string

const (
	SourceScenario Source = "scenario"
	SourceDirect   Source = "direct-install"
)

type InstallRequest struct {
	Schema              string                      `json:"schema"`
	Source              Source                      `json:"source"`
	ScenarioID          string                      `json:"scenarioId,omitempty"`
	CatalogDigest       string                      `json:"catalogDigest"`
	ProjectRoot         string                      `json:"projectRoot"`
	PlatformRoot        string                      `json:"platformRoot"`
	Components          []string                    `json:"components"`
	Binaries            []string                    `json:"binaries,omitempty"`
	Effects             []string                    `json:"effects,omitempty"`
	RefreshPackages     bool                        `json:"refreshPackages,omitempty"`
	ProviderPreferences map[string][]string         `json:"providerPreferences,omitempty"`
	PackageOverrides    map[string]string           `json:"packageOverrides,omitempty"`
	Values              map[string]json.RawMessage  `json:"values,omitempty"`
	AssemblyOutputs     []engineconfig.ConfigOutput `json:"assemblyOutputs,omitempty"`
}

type ActionKind string

const (
	ActionInstallPackage ActionKind = "installPackage"
	ActionBindProvider   ActionKind = "bindProvider"
	ActionWriteConfig    ActionKind = "writeConfig"
)

type PlanAction struct {
	ID        string            `json:"id"`
	Kind      ActionKind        `json:"kind"`
	DependsOn []string          `json:"dependsOn,omitempty"`
	Inputs    map[string]string `json:"inputs,omitempty"`
	Retry     RetryPolicy       `json:"retry,omitempty"`
	Rollback  RollbackPolicy    `json:"rollback,omitempty"`
}

type RetryPolicy struct {
	MaxAttempts   int `json:"maxAttempts,omitempty"`
	BackoffMillis int `json:"backoffMillis,omitempty"`
}

type RollbackPolicy string

const (
	RollbackNone    RollbackPolicy = "none"
	RollbackHandler RollbackPolicy = "handler"
)

type InstallPlan struct {
	Schema        string                      `json:"schema"`
	CatalogDigest string                      `json:"catalogDigest"`
	Source        Source                      `json:"source"`
	ScenarioID    string                      `json:"scenarioId,omitempty"`
	ProjectRoot   string                      `json:"projectRoot"`
	PlatformRoot  string                      `json:"platformRoot"`
	Effects       []string                    `json:"effects,omitempty"`
	Values        map[string]json.RawMessage  `json:"values,omitempty"`
	Binaries      []string                    `json:"binaries,omitempty"`
	Assembly      engineconfig.ConfigAssembly `json:"assembly"`
	Actions       []PlanAction                `json:"actions"`
	PlanHash      string                      `json:"planHash"`
}

type ResolutionError struct {
	Code       string
	Capability string
	Component  string
	Features   []string
}

func (e ResolutionError) Error() string {
	if e.Component != "" {
		return fmt.Sprintf("%s: component %q requires capability %q with features %v", e.Code, e.Component, e.Capability, e.Features)
	}
	return fmt.Sprintf("%s: capability %q with features %v", e.Code, e.Capability, e.Features)
}

func Compile(request InstallRequest, source catalog.Catalog) (InstallPlan, error) {
	if err := source.Validate(); err != nil {
		return InstallPlan{}, fmt.Errorf("catalog: %w", err)
	}
	if request.Schema == "" {
		request.Schema = "kb.install/1"
	}
	if request.CatalogDigest == "" {
		request.CatalogDigest = source.Digest
	}
	componentIDs := catalog.SortedIDs(request.Components)
	assembly := engineconfig.ConfigAssembly{Outputs: append([]engineconfig.ConfigOutput(nil), source.Outputs...)}
	assembly.Artifacts = append(assembly.Artifacts, source.Artifacts...)
	assembly.Outputs = append(assembly.Outputs, request.AssemblyOutputs...)
	assembly.Patches = append(assembly.Patches, source.Defaults...)
	if request.PlatformRoot != "" {
		platformDir, _ := json.Marshal(request.PlatformRoot)
		assembly.Patches = append(assembly.Patches, engineconfig.ConfigPatch{ID: "platform.dir", Scope: engineconfig.ScopePlatform, Operation: engineconfig.OperationSet, Path: "/platform/dir", Value: platformDir, Owner: "kb-create"})
	}
	if request.ProjectRoot != "" && request.PlatformRoot != "" {
		platformDir, _ := json.Marshal(request.PlatformRoot)
		assembly.Patches = append(assembly.Patches, engineconfig.ConfigPatch{ID: "project.platform.dir", Scope: engineconfig.ScopeProject, Operation: engineconfig.OperationSet, Path: "/platform/dir", Value: platformDir, Owner: "kb-create"})
	}
	selected := make(map[string]catalog.Component, len(componentIDs))
	for _, id := range componentIDs {
		component, ok := source.Component(id)
		if !ok {
			return InstallPlan{}, fmt.Errorf("unknown component %q", id)
		}
		if override := request.PackageOverrides[id]; override != "" {
			component.Package = override
		}
		selected[id] = component
		assembly.Patches = append(assembly.Patches, component.Config...)
	}

	providers := make(map[string]catalog.Provider)
	for _, componentID := range componentIDs {
		component := selected[componentID]
		for _, requirement := range component.Requires {
			provider, err := resolveProvider(requirement, componentID, request.ProviderPreferences[requirement.Capability], source)
			if err != nil {
				return InstallPlan{}, err
			}
			providers[requirement.Capability] = provider
			providerValue, _ := json.Marshal(provider.Package)
			assembly.Patches = append(assembly.Patches, engineconfig.ConfigPatch{
				ID:        "provider." + requirement.Capability,
				Scope:     engineconfig.ScopePlatform,
				Operation: engineconfig.OperationSet,
				Path:      "/platform/adapters/" + requirement.Capability,
				Value:     providerValue,
				Owner:     "provider:" + provider.ID,
			})
			assembly.Patches = append(assembly.Patches, provider.Config...)
		}
	}
	// Explicit adapter selections are configuration, not merely provider
	// preferences. Materialize them even when the selected component does not
	// currently declare a requirement for that capability (for example a CI
	// install selecting a storage backend for a later command). When the
	// package is not present in the catalog, it is still a valid user-supplied
	// provider package and must be installed and written to runtime config.
	for _, capability := range sortedPreferenceKeys(request.ProviderPreferences) {
		preferences := request.ProviderPreferences[capability]
		if len(preferences) == 0 || preferences[0] == "" {
			continue
		}
		if _, exists := providers[capability]; exists {
			continue
		}
		provider := catalog.Provider{ID: "explicit:" + capability, Capability: capability, Package: preferences[0]}
		if known, ok := source.Provider(preferences[0]); ok {
			provider = known
		}
		providers[capability] = provider
		providerValue, _ := json.Marshal(provider.Package)
		assembly.Patches = append(assembly.Patches, engineconfig.ConfigPatch{
			ID:        "adapter." + capability,
			Scope:     engineconfig.ScopePlatform,
			Operation: engineconfig.OperationSet,
			Path:      "/platform/adapters/" + capability,
			Value:     providerValue,
			Owner:     "provider:" + provider.ID,
		})
	}

	// Installing one package per action made a fresh platform run pnpm's full
	// dependency resolution once for every artifact. Keep transaction boundaries
	// where they matter (foundation before selected extensions), but install each
	// deterministic group in one package-manager invocation.
	actions := make([]PlanAction, 0, len(providers)+3)
	foundation := ""
	if specs := catalog.SortedIDs(source.Core); len(specs) > 0 {
		foundation = "install:foundation"
		actions = append(actions, packageAction(foundation, "foundation", specs, nil, nil, request.RefreshPackages))
	}
	selectionSpecs := make([]string, 0, len(selected)+len(providers))
	for _, id := range componentIDs {
		component := selected[id]
		selectionSpecs = append(selectionSpecs, component.Package)
		selectionSpecs = append(selectionSpecs, component.CompanionPackages...)
	}
	capabilities := make([]string, 0, len(providers))
	for capability := range providers {
		capabilities = append(capabilities, capability)
	}
	sort.Strings(capabilities)
	for _, capability := range capabilities {
		provider := providers[capability]
		selectionSpecs = append(selectionSpecs, provider.Package)
		dependencies := []string{"install:selection"}
		actions = append(actions, PlanAction{ID: "bind:" + capability, Kind: ActionBindProvider, DependsOn: dependencies, Inputs: map[string]string{"capability": capability, "provider": provider.ID, "package": provider.Package}})
	}
	if len(selectionSpecs) > 0 {
		dependencies := make([]string, 0, 1)
		if foundation != "" {
			dependencies = append(dependencies, foundation)
		}
		actions = append(actions, packageAction("install:selection", "selection", selectionSpecs, componentIDs, dependencies, request.RefreshPackages))
	}
	// Scenario/direct effects are applied after component and provider
	// contributions. Effect IDs are sorted so request ordering cannot change
	// the compiled plan or its hash.
	effectIDs := catalog.SortedIDs(request.Effects)
	seenEffects := make(map[string]struct{}, len(effectIDs))
	for _, effectID := range effectIDs {
		if _, exists := seenEffects[effectID]; exists {
			return InstallPlan{}, fmt.Errorf("duplicate effect %q", effectID)
		}
		seenEffects[effectID] = struct{}{}
		effect, ok := source.Effect(effectID)
		if !ok {
			return InstallPlan{}, fmt.Errorf("unknown effect %q", effectID)
		}
		assembly.Patches = append(assembly.Patches, effect.Config...)
	}
	actions = append(actions, PlanAction{ID: "config:runtime", Kind: ActionWriteConfig, DependsOn: actionIDs(actions)})
	result := InstallPlan{Schema: request.Schema, CatalogDigest: request.CatalogDigest, Source: request.Source, ScenarioID: request.ScenarioID, ProjectRoot: request.ProjectRoot, PlatformRoot: request.PlatformRoot, Effects: effectIDs, Values: cloneValues(request.Values), Binaries: catalog.SortedIDs(request.Binaries), Assembly: assembly, Actions: actions}
	result.PlanHash = hashPlan(result)
	return result, nil
}

func packageAction(id, component string, specs, components, dependsOn []string, update bool) PlanAction {
	specs = catalog.SortedIDs(specs)
	inputs := map[string]string{
		"component": component,
		"packages":  strings.Join(specs, "\n"),
	}
	if len(components) > 0 {
		inputs["components"] = strings.Join(catalog.SortedIDs(components), "\n")
	}
	if update {
		inputs["mode"] = "update"
	}
	return PlanAction{ID: id, Kind: ActionInstallPackage, DependsOn: append([]string(nil), dependsOn...), Inputs: inputs}
}

func sortedPreferenceKeys(preferences map[string][]string) []string {
	keys := make([]string, 0, len(preferences))
	for key := range preferences {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func cloneValues(values map[string]json.RawMessage) map[string]json.RawMessage {
	if len(values) == 0 {
		return nil
	}
	result := make(map[string]json.RawMessage, len(values))
	for key, value := range values {
		result[key] = append(json.RawMessage(nil), value...)
	}
	return result
}

func resolveProvider(requirement catalog.Requirement, component string, preferences []string, source catalog.Catalog) (catalog.Provider, error) {
	for _, preferred := range preferences {
		provider, ok := source.Provider(preferred)
		if ok && provider.Capability == requirement.Capability && catalog.HasFeatures(provider, requirement.Features) {
			return provider, nil
		}
	}
	providers := append([]catalog.Provider(nil), source.Providers...)
	sort.Slice(providers, func(i, j int) bool { return providers[i].ID < providers[j].ID })
	for _, provider := range providers {
		if provider.Capability == requirement.Capability && catalog.HasFeatures(provider, requirement.Features) {
			return provider, nil
		}
	}
	return catalog.Provider{}, ResolutionError{Code: "CAPABILITY_UNRESOLVED", Capability: requirement.Capability, Component: component, Features: requirement.Features}
}

func actionIDs(actions []PlanAction) []string {
	ids := make([]string, 0, len(actions))
	for _, action := range actions {
		ids = append(ids, action.ID)
	}
	return ids
}

func hashPlan(plan InstallPlan) string {
	copyPlan := plan
	copyPlan.PlanHash = ""
	// Scenario metadata and persisted non-secret answers describe provenance;
	// execution equivalence is determined by the resolved actions/assembly.
	copyPlan.ScenarioID = ""
	copyPlan.Values = nil
	data, _ := json.Marshal(copyPlan)
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}
