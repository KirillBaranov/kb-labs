package catalog

import (
	"testing"

	"github.com/kb-labs/create/v2/contracts"
)

func TestSealAndVerifyImmutableReleaseIndex(t *testing.T) {
	source, err := Seal(Catalog{Platforms: []PlatformBundle{{ID: "platform", Version: "2.0.0", Package: "@kb/platform", Tarball: "https://example.test/platform.tgz", SHA256: "artifact", Profiles: map[string]contracts.ServiceGraph{"default": {}}}}})
	if err != nil || source.Digest == "" || Verify(source) != nil {
		t.Fatalf("source/error = %#v / %v", source, err)
	}
	source.Platforms[0].Package = "@kb/tampered"
	if err := Verify(source); err == nil {
		t.Fatal("expected digest mismatch")
	}
}

func TestValidateRejectsGraphNodeOutsideIndex(t *testing.T) {
	_, err := Seal(Catalog{
		Compatibility: &CompatibilityGraph{
			Schema: CompatibilityGraphSchema,
			Nodes: []GraphNode{
				{ID: "@kb/platform", Kind: KindPlatform, Version: "2.0.0"},
				{ID: "@kb/sdk", Kind: KindSDK, Version: "2.1.0"},
			},
		},
		Platforms: []PlatformBundle{{ID: "platform", Version: "2.0.0", Package: "@kb/platform", Tarball: "https://example.test/platform.tgz", SHA256: "artifact", Profiles: map[string]contracts.ServiceGraph{"default": {}}}},
	})
	if contracts.CodeOf(err) != contracts.CodeReleaseGraphNodeUnknown {
		t.Fatalf("expected unknown graph node, got %v", err)
	}
}

func TestValidateRejectsEdgeToAbsentNode(t *testing.T) {
	_, err := Seal(Catalog{
		Compatibility: &CompatibilityGraph{
			Schema: CompatibilityGraphSchema,
			Nodes:  []GraphNode{{ID: "@kb/platform", Kind: KindPlatform, Version: "2.0.0"}},
			Edges:  []GraphEdge{{From: PackageKey("@kb/platform", "2.0.0"), To: PackageKey("@kb/sdk", "2.1.0"), Kind: EdgeRequires}},
		},
		Platforms: []PlatformBundle{{ID: "platform", Version: "2.0.0", Package: "@kb/platform", Tarball: "https://example.test/platform.tgz", SHA256: "artifact", Profiles: map[string]contracts.ServiceGraph{"default": {}}}},
	})
	if contracts.CodeOf(err) != contracts.CodeReleaseGraphNodeUnknown {
		t.Fatalf("expected dangling edge to be rejected, got %v", err)
	}
}

// A binary node for a dropped target must be rejected at seal time rather than
// silently never matching the local machine.
func TestValidateRejectsUnsupportedBinaryTarget(t *testing.T) {
	_, err := Seal(Catalog{
		Compatibility: &CompatibilityGraph{
			Schema: CompatibilityGraphSchema,
			Nodes: []GraphNode{
				{ID: "@kb/platform", Kind: KindPlatform, Version: "2.0.0"},
				{ID: "kb-dev", Kind: KindBinary, Version: "2.0.0", OS: "windows", Arch: "amd64"},
			},
		},
		Platforms: []PlatformBundle{{ID: "platform", Version: "2.0.0", Package: "@kb/platform", Tarball: "https://example.test/platform.tgz", SHA256: "artifact", Profiles: map[string]contracts.ServiceGraph{"default": {}}}},
	})
	if contracts.CodeOf(err) != contracts.CodeReleaseTargetUnsupported {
		t.Fatalf("expected unsupported target, got %v", err)
	}
}

// NodeKey is the interop surface with releaseGraphNodeKey in the TypeScript
// release contracts. A drift here silently dangles every edge a sealed bundle
// declares, so it is asserted literally.
func TestNodeKeyMatchesTypeScriptScheme(t *testing.T) {
	if got := NodeKey(GraphNode{ID: "@kb/platform", Kind: KindPlatform, Version: "2.0.0"}); got != "package:@kb/platform@2.0.0" {
		t.Fatalf("package key = %q", got)
	}
	if got := NodeKey(GraphNode{ID: "kb-dev", Kind: KindBinary, Version: "2.0.0", OS: "linux", Arch: "arm64"}); got != "binary:kb-dev@2.0.0:linux/arm64" {
		t.Fatalf("binary key = %q", got)
	}
}

func TestCheckCompatibilityRequiresExplicitPlatformSDKRelation(t *testing.T) {
	platformKey := PackageKey("@kb/platform", "2.0.0")
	sdkKey := PackageKey("@kb/sdk", "2.1.0")
	binaryKey := BinaryKey("kb-dev", "2.0.0", "linux", "amd64")
	source := Catalog{
		Compatibility: &CompatibilityGraph{
			Schema: CompatibilityGraphSchema,
			Nodes: []GraphNode{
				{ID: "@kb/platform", Kind: KindPlatform, Version: "2.0.0"},
				{ID: "@kb/sdk", Kind: KindSDK, Version: "2.1.0"},
				{ID: "kb-dev", Kind: KindBinary, Version: "2.0.0", OS: "linux", Arch: "amd64"},
			},
			Edges: []GraphEdge{
				{From: platformKey, To: sdkKey, Kind: EdgeRequires, Range: "^2.1.0"},
				{From: binaryKey, To: platformKey, Kind: EdgeRequires, Range: "2.0.0"},
				{From: binaryKey, To: sdkKey, Kind: EdgeRequires, Range: "^2.1.0"},
			},
		},
		Platforms: []PlatformBundle{{ID: "platform", Version: "2.0.0", Package: "@kb/platform", Tarball: "https://example.test/platform.tgz", SHA256: "artifact", Profiles: map[string]contracts.ServiceGraph{"default": {}}, Binaries: []Binary{{ID: "kb-dev", OS: "linux", Arch: "amd64", URL: "https://example.test/kb-dev", SHA256: "binary", Filename: "kb-dev"}}}},
		SDKs:      []Component{{ID: "sdk", Version: "2.1.0", Package: "@kb/sdk", SHA256: "sdk", Tarball: "https://example.test/sdk.tgz"}},
	}
	if err := CheckCompatibility(source, "2.0.0", "2.1.0", "kb-dev", "linux", "amd64"); err != nil {
		t.Fatal(err)
	}
	if err := CheckCompatibility(source, "2.0.0", "2.2.0", "", "", ""); contracts.CodeOf(err) != contracts.CodeReleaseGraphNodeUnknown {
		t.Fatalf("expected unrelated SDK to be rejected, got %v", err)
	}
	if err := CheckCompatibility(source, "2.0.0", "2.1.0", "kb-dev", "windows", "amd64"); contracts.CodeOf(err) != contracts.CodeReleaseTargetUnsupported {
		t.Fatalf("expected windows target to be rejected, got %v", err)
	}
}

// A conflictsWith edge must veto a selection the requires edges would allow.
func TestCheckCompatibilityRejectsDeclaredConflict(t *testing.T) {
	platformKey := PackageKey("@kb/platform", "2.0.0")
	sdkKey := PackageKey("@kb/sdk", "2.1.0")
	source := Catalog{
		Compatibility: &CompatibilityGraph{
			Schema: CompatibilityGraphSchema,
			Nodes: []GraphNode{
				{ID: "@kb/platform", Kind: KindPlatform, Version: "2.0.0"},
				{ID: "@kb/sdk", Kind: KindSDK, Version: "2.1.0"},
			},
			Edges: []GraphEdge{
				{From: platformKey, To: sdkKey, Kind: EdgeRequires},
				{From: platformKey, To: sdkKey, Kind: EdgeConflictsWith},
			},
		},
		Platforms: []PlatformBundle{{ID: "platform", Version: "2.0.0", Package: "@kb/platform", Tarball: "https://example.test/platform.tgz", SHA256: "artifact", Profiles: map[string]contracts.ServiceGraph{"default": {}}}},
		SDKs:      []Component{{ID: "sdk", Version: "2.1.0", Package: "@kb/sdk", SHA256: "sdk", Tarball: "https://example.test/sdk.tgz"}},
	}
	if err := CheckCompatibility(source, "2.0.0", "2.1.0", "", "", ""); contracts.CodeOf(err) != contracts.CodeIncompatibleComponents {
		t.Fatalf("expected declared conflict to be rejected, got %v", err)
	}
}
