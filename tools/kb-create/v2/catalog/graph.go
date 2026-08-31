package catalog

import (
	"fmt"
	"sort"
	"strings"

	"github.com/kb-labs/create/v2/contracts"
)

// CompatibilityGraphSchema versions the release-owned compatibility graph.
// Version 3 replaces the flat label matrix of version 2: a cartesian
// SDK x platform x binary product cannot express service profiles, provider
// capabilities or per-target variants without growing a new column per
// dimension, while a graph absorbs a new node kind without a schema change.
const CompatibilityGraphSchema = "kb.release-compatibility/3"

// Node kinds. `binary` is the only kind with an OS/arch variant; every other
// kind is addressed by the package identity that ships it.
const (
	KindPlatform  = "platform"
	KindMember    = "member"
	KindSDK       = "sdk"
	KindPlugin    = "plugin"
	KindAdapter   = "adapter"
	KindBinary    = "binary"
	KindService   = "service"
	KindLauncher  = "launcher"
	KindToolchain = "toolchain"
)

// Edge kinds. `requires` and `provides` are the two the TypeScript sealer
// emits today; `compatibleWith` and `conflictsWith` are read by the resolver
// so a future release can express a non-directional relation without a
// launcher release.
const (
	EdgeRequires       = "requires"
	EdgeProvides       = "provides"
	EdgeCompatibleWith = "compatibleWith"
	EdgeConflictsWith  = "conflictsWith"
)

// GraphNode is one addressable release participant. `Variant` carries a
// non-target dimension (service profile, provider capability) and `Digest`
// pins the exact artifact bytes when the node is directly installable.
type GraphNode struct {
	ID      string `json:"id"`
	Kind    string `json:"kind"`
	Version string `json:"version"`
	OS      string `json:"os,omitempty"`
	Arch    string `json:"arch,omitempty"`
	Variant string `json:"variant,omitempty"`
	Digest  string `json:"digest,omitempty"`
}

// GraphEdge relates two nodes by their keys. `Range` is an optional semver
// constraint carried for auditability; edge presence, not range arithmetic, is
// what the strict resolver accepts.
type GraphEdge struct {
	From  string `json:"from"`
	To    string `json:"to"`
	Kind  string `json:"kind"`
	Range string `json:"range,omitempty"`
}

// GraphProfile names the member set and provider set of one service profile.
type GraphProfile struct {
	ID        string   `json:"id"`
	Members   []string `json:"members"`
	Providers []string `json:"providers"`
}

type CompatibilityGraph struct {
	Schema   string         `json:"schema"`
	Nodes    []GraphNode    `json:"nodes"`
	Edges    []GraphEdge    `json:"edges"`
	Profiles []GraphProfile `json:"profiles,omitempty"`
}

// NodeKey mirrors releaseGraphNodeKey in the TypeScript release contracts
// byte-for-byte. A bundle sealed by the plugin and a graph traversed here must
// address the same node with the same string, otherwise every edge dangles.
func NodeKey(node GraphNode) string {
	if node.Kind == KindBinary {
		return fmt.Sprintf("binary:%s@%s:%s/%s", node.ID, node.Version, node.OS, node.Arch)
	}
	return fmt.Sprintf("package:%s@%s", node.ID, node.Version)
}

// PackageKey and BinaryKey are the two call sites that build a key without
// already holding a node.
func PackageKey(id, version string) string { return "package:" + id + "@" + version }
func BinaryKey(id, version, os, arch string) string {
	return fmt.Sprintf("binary:%s@%s:%s/%s", id, version, os, arch)
}

func validateGraph(graph CompatibilityGraph, source Catalog) error {
	if graph.Schema != CompatibilityGraphSchema {
		return contracts.ReleaseError(
			contracts.CodeReleaseSchemaUnsupported,
			contracts.StageResolve,
			"release compatibility graph schema is not supported",
			"republish the release with the current release plugin; there is no legacy graph reader",
			fmt.Errorf("unsupported compatibility graph schema %q, expected %q", graph.Schema, CompatibilityGraphSchema),
		)
	}
	if len(graph.Nodes) == 0 {
		return contracts.ReleaseError(contracts.CodeReleaseIndexInvalid, contracts.StageResolve,
			"release compatibility graph declares no nodes",
			"reseal the release index with a complete compatibility graph", nil)
	}
	known := make(map[string]GraphNode, len(graph.Nodes))
	for _, node := range graph.Nodes {
		if strings.TrimSpace(node.ID) == "" || strings.TrimSpace(node.Kind) == "" || strings.TrimSpace(node.Version) == "" {
			return contracts.ReleaseError(contracts.CodeReleaseIndexInvalid, contracts.StageResolve,
				"release compatibility node is incomplete",
				"every graph node must declare id, kind and version", nil)
		}
		if node.Kind == KindBinary {
			if !contracts.SupportedTarget(node.OS, node.Arch) {
				return contracts.ReleaseError(contracts.CodeReleaseTargetUnsupported, contracts.StageResolve,
					"release compatibility graph declares a binary outside the supported matrix",
					"supported targets are "+strings.Join(contracts.SupportedTargets(), ", "),
					fmt.Errorf("binary %q targets %s/%s", node.ID, node.OS, node.Arch),
				).WithDetail("target", node.OS+"/"+node.Arch)
			}
		} else if node.OS != "" || node.Arch != "" {
			return contracts.ReleaseError(contracts.CodeReleaseIndexInvalid, contracts.StageResolve,
				"only binary graph nodes may declare an os/arch variant",
				"remove os/arch from non-binary nodes or reclassify the node as a binary", nil)
		}
		key := NodeKey(node)
		if _, exists := known[key]; exists {
			return contracts.ReleaseError(contracts.CodeReleaseIndexInvalid, contracts.StageResolve,
				"release compatibility graph declares a duplicate node",
				"seal exactly one node per release participant",
				fmt.Errorf("duplicate graph node %q", key))
		}
		known[key] = node
		if err := graphNodeArtifactExists(source, node); err != nil {
			return err
		}
	}
	for _, edge := range graph.Edges {
		switch edge.Kind {
		case EdgeRequires, EdgeProvides, EdgeCompatibleWith, EdgeConflictsWith:
		default:
			return contracts.ReleaseError(contracts.CodeReleaseIndexInvalid, contracts.StageResolve,
				"release compatibility graph declares an unknown edge kind",
				"use requires, provides, compatibleWith or conflictsWith",
				fmt.Errorf("unknown edge kind %q", edge.Kind))
		}
		for _, endpoint := range []string{edge.From, edge.To} {
			if _, exists := known[endpoint]; !exists {
				return contracts.ReleaseError(contracts.CodeReleaseGraphNodeUnknown, contracts.StageResolve,
					"release compatibility graph references an unknown node",
					"reseal the release index; edges may only address nodes it declares",
					fmt.Errorf("edge %s -> %s references absent node %q", edge.From, edge.To, endpoint),
				).WithDetail("node", endpoint)
			}
		}
	}
	for _, profile := range graph.Profiles {
		if strings.TrimSpace(profile.ID) == "" {
			return contracts.ReleaseError(contracts.CodeReleaseIndexInvalid, contracts.StageResolve,
				"release compatibility profile must declare an id", "reseal the release index", nil)
		}
		for _, member := range append(append([]string(nil), profile.Members...), profile.Providers...) {
			if _, exists := known[member]; !exists {
				return contracts.ReleaseError(contracts.CodeReleaseGraphNodeUnknown, contracts.StageResolve,
					"release compatibility profile references an unknown node",
					"reseal the release index; profiles may only address declared nodes",
					fmt.Errorf("profile %q references absent node %q", profile.ID, member),
				).WithDetail("node", member)
			}
		}
	}
	return nil
}

// graphNodeArtifactExists keeps the graph honest about the index it ships in:
// a node that no shipped artifact backs would let the resolver approve a
// combination the release cannot actually install.
func graphNodeArtifactExists(source Catalog, node GraphNode) error {
	present := false
	switch node.Kind {
	case KindPlatform:
		for _, value := range source.Platforms {
			if value.Package == node.ID && value.Version == node.Version {
				present = true
			}
		}
	case KindMember:
		for _, platform := range source.Platforms {
			for _, member := range platform.Members {
				if member.Package == node.ID && member.Version == node.Version {
					present = true
				}
			}
		}
	case KindSDK:
		present = componentPresent(source.SDKs, node)
	case KindPlugin:
		present = componentPresent(source.Plugins, node)
	case KindAdapter:
		for _, adapter := range source.Adapters {
			if adapter.Package == node.ID && adapter.Version == node.Version {
				present = true
			}
		}
	case KindBinary:
		for _, platform := range source.Platforms {
			for _, binary := range platform.Binaries {
				if binary.ID == node.ID && platform.Version == node.Version && binary.OS == node.OS && binary.Arch == node.Arch {
					present = true
				}
			}
		}
	default:
		// service, launcher, toolchain and any kind added later are declared
		// by the release rather than shipped as an index artifact. Generic
		// validation must not reject a kind this launcher predates.
		return nil
	}
	if present {
		return nil
	}
	return contracts.ReleaseError(contracts.CodeReleaseGraphNodeUnknown, contracts.StageResolve,
		"release compatibility graph declares a node the release index does not ship",
		"reseal the release index so every graph node has a shipped artifact",
		fmt.Errorf("graph node %q has no %s artifact in the index", NodeKey(node), node.Kind),
	).WithDetail("node", NodeKey(node))
}

func componentPresent(values []Component, node GraphNode) bool {
	for _, value := range values {
		if value.Package == node.ID && value.Version == node.Version {
			return true
		}
	}
	return false
}

// CheckCompatibility is the runtime decision boundary. Selection is accepted
// only when the sealed graph explicitly relates the chosen nodes: semver
// proximity is not a compatibility claim for a pre-stable platform.
func CheckCompatibility(source Catalog, platformVersion, sdkVersion, binaryID, targetOS, targetArch string) error {
	if source.Compatibility == nil {
		return contracts.ReleaseError(contracts.CodeReleaseIndexInvalid, contracts.StageResolve,
			"release index has no compatibility graph",
			"install from a release index sealed with a compatibility graph", nil)
	}
	graph := *source.Compatibility
	platform, ok := findPlatform(source.Platforms, platformVersion)
	if !ok {
		return contracts.ReleaseError(contracts.CodeReleaseGraphNodeUnknown, contracts.StageResolve,
			"selected platform is not present in the release index",
			"select a platform version the release index ships",
			fmt.Errorf("platform version %q is absent", platformVersion))
	}
	platformKey := PackageKey(platform.Package, platform.Version)
	if !hasNode(graph, platformKey) {
		return unknownNode(platformKey)
	}
	selected := []string{platformKey}
	sdkKey := ""
	if sdkVersion != "" {
		sdk, found := findComponentByVersion(source.SDKs, sdkVersion)
		if !found {
			return contracts.ReleaseError(contracts.CodeReleaseGraphNodeUnknown, contracts.StageResolve,
				"selected SDK is not present in the release index",
				"select an SDK version the release index ships",
				fmt.Errorf("sdk version %q is absent", sdkVersion))
		}
		sdkKey = PackageKey(sdk.Package, sdk.Version)
		if !hasNode(graph, sdkKey) {
			return unknownNode(sdkKey)
		}
		if !related(graph, platformKey, sdkKey) {
			return missingEdge(platformKey, sdkKey)
		}
		selected = append(selected, sdkKey)
	}
	if binaryID != "" {
		if !contracts.SupportedTarget(targetOS, targetArch) {
			return contracts.ReleaseError(contracts.CodeReleaseTargetUnsupported, contracts.StageResolve,
				"the local platform is outside the supported release matrix",
				"supported targets are "+strings.Join(contracts.SupportedTargets(), ", "),
				fmt.Errorf("target %s/%s is not released", targetOS, targetArch),
			).WithDetail("target", targetOS+"/"+targetArch)
		}
		binaryKey := BinaryKey(binaryID, platform.Version, targetOS, targetArch)
		if !hasNode(graph, binaryKey) {
			return unknownNode(binaryKey)
		}
		if !related(graph, binaryKey, platformKey) {
			return missingEdge(binaryKey, platformKey)
		}
		if sdkKey != "" && !related(graph, binaryKey, sdkKey) {
			return missingEdge(binaryKey, sdkKey)
		}
		selected = append(selected, binaryKey)
	}
	return checkConflicts(graph, selected)
}

func checkConflicts(graph CompatibilityGraph, selected []string) error {
	chosen := make(map[string]bool, len(selected))
	for _, key := range selected {
		chosen[key] = true
	}
	for _, edge := range graph.Edges {
		if edge.Kind == EdgeConflictsWith && chosen[edge.From] && chosen[edge.To] {
			return contracts.ReleaseError(contracts.CodeIncompatibleComponents, contracts.StageResolve,
				"the release graph declares the selected components as conflicting",
				"choose a different platform, SDK or binary combination",
				fmt.Errorf("%s conflicts with %s", edge.From, edge.To))
		}
	}
	return nil
}

func hasNode(graph CompatibilityGraph, key string) bool {
	for _, node := range graph.Nodes {
		if NodeKey(node) == key {
			return true
		}
	}
	return false
}

// related accepts a directed requires/provides edge in either direction and a
// symmetric compatibleWith edge. The sealer emits `requires` from the dependent
// to its dependency; the resolver only needs to know the relation was declared.
func related(graph CompatibilityGraph, from, to string) bool {
	for _, edge := range graph.Edges {
		if edge.Kind == EdgeConflictsWith {
			continue
		}
		if (edge.From == from && edge.To == to) || (edge.From == to && edge.To == from) {
			return true
		}
	}
	return false
}

func unknownNode(key string) error {
	return contracts.ReleaseError(contracts.CodeReleaseGraphNodeUnknown, contracts.StageResolve,
		"release compatibility graph has no node for the selected component",
		"select a component combination the release actually sealed",
		fmt.Errorf("graph node %q is absent", key)).WithDetail("node", key)
}

func missingEdge(from, to string) error {
	return contracts.ReleaseError(contracts.CodeReleaseGraphEdgeMissing, contracts.StageResolve,
		"release compatibility graph does not relate the selected components",
		"select a component combination the release declares as compatible",
		fmt.Errorf("no edge relates %q to %q", from, to)).WithDetail("from", from).WithDetail("to", to)
}

func findComponentByVersion(values []Component, version string) (Component, bool) {
	for _, value := range values {
		if value.Version == version {
			return value, true
		}
	}
	return Component{}, false
}

// GraphNodeKeys is a stable rendering of the graph for journals and dossiers.
func GraphNodeKeys(graph CompatibilityGraph) []string {
	result := make([]string, 0, len(graph.Nodes))
	for _, node := range graph.Nodes {
		result = append(result, NodeKey(node))
	}
	sort.Strings(result)
	return result
}
