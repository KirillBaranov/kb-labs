// Package catalog defines the small, immutable release index consumed before
// artifacts are installed. It is deliberately not a copy of every manifest:
// manifests remain the source of truth after their selected artifacts exist.
package catalog

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/kb-labs/create/v2/contracts"
)

const Schema = "kb.create.release-index/v2"

type Catalog struct {
	Schema string `json:"schema"`
	Digest string `json:"digest"`
	// ReleaseID ties the index back to the immutable descriptor that published
	// it. The index itself is channel-independent: a channel is an externally
	// resolved pointer, never a field a sealed document can rewrite.
	ReleaseID     string              `json:"releaseId,omitempty"`
	Compatibility *CompatibilityGraph `json:"compatibility,omitempty"`
	Platforms     []PlatformBundle    `json:"platforms"`
	SDKs          []Component         `json:"sdks"`
	Plugins       []Component         `json:"plugins"`
	Adapters      []Adapter           `json:"adapters"`
}

// Seal normalizes a release index and records the SHA-256 digest of its
// canonical payload. Publishing calls this after manifest export; consuming
// calls Validate before resolving anything.
func Seal(source Catalog) (Catalog, error) {
	if source.Schema == "" {
		source.Schema = Schema
	}
	source.Digest = ""
	if err := Validate(source); err != nil {
		return Catalog{}, err
	}
	digest, err := digest(source)
	if err != nil {
		return Catalog{}, err
	}
	source.Digest = digest
	return source, nil
}

func Validate(source Catalog) error {
	if source.Schema != Schema {
		return fmt.Errorf("unsupported release index schema %q", source.Schema)
	}
	if len(source.Platforms) == 0 {
		return fmt.Errorf("release index contains no platform bundles")
	}
	if source.Compatibility != nil {
		if err := validateGraph(*source.Compatibility, source); err != nil {
			return err
		}
	}
	seen := map[string]bool{}
	for _, platform := range source.Platforms {
		if platform.ID == "" || platform.Version == "" || platform.Package == "" || platform.SHA256 == "" || platform.Tarball == "" {
			return fmt.Errorf("platform bundle must declare ID, version, package, tarball and sha256")
		}
		key := platform.ID + "@" + platform.Version
		if seen[key] {
			return fmt.Errorf("duplicate platform bundle %q", key)
		}
		seen[key] = true
		if len(platform.Profiles) == 0 {
			return fmt.Errorf("platform bundle %q has no service profile", key)
		}
		for _, binary := range platform.Binaries {
			if binary.ID == "" || binary.OS == "" || binary.Arch == "" || binary.URL == "" || binary.SHA256 == "" || binary.Filename == "" {
				return fmt.Errorf("platform bundle %q has incomplete binary artifact", key)
			}
		}
		for _, member := range platform.Members {
			if member.ID == "" || member.Version == "" || member.Package == "" || member.SHA256 == "" || member.Tarball == "" {
				return fmt.Errorf("platform bundle %q has incomplete member artifact", key)
			}
		}
	}
	for _, component := range append(append([]Component(nil), source.SDKs...), source.Plugins...) {
		if component.ID == "" || component.Version == "" || component.Package == "" || component.SHA256 == "" || component.Tarball == "" {
			return fmt.Errorf("component must declare ID, version, package, tarball and sha256")
		}
	}
	for _, adapter := range source.Adapters {
		if adapter.ID == "" || adapter.Version == "" || adapter.Package == "" || adapter.SHA256 == "" || adapter.Tarball == "" {
			return fmt.Errorf("adapter must declare ID, version, package, tarball and sha256")
		}
	}
	return nil
}

func Verify(source Catalog) error {
	if source.Digest == "" {
		return fmt.Errorf("release index digest is required")
	}
	expected := source.Digest
	source.Digest = ""
	if err := Validate(source); err != nil {
		return err
	}
	actual, err := digest(source)
	if err != nil {
		return err
	}
	if !strings.EqualFold(expected, actual) {
		return fmt.Errorf("release index digest mismatch")
	}
	return nil
}

func digest(source Catalog) (string, error) {
	// Release tooling canonicalizes ordering, so semantically identical exports
	// produce one auditable index digest independent of filesystem ordering.
	sort.Slice(source.Platforms, func(i, j int) bool {
		return source.Platforms[i].ID+source.Platforms[i].Version < source.Platforms[j].ID+source.Platforms[j].Version
	})
	sort.Slice(source.SDKs, func(i, j int) bool {
		return source.SDKs[i].ID+source.SDKs[i].Version < source.SDKs[j].ID+source.SDKs[j].Version
	})
	sort.Slice(source.Plugins, func(i, j int) bool {
		return source.Plugins[i].ID+source.Plugins[i].Version < source.Plugins[j].ID+source.Plugins[j].Version
	})
	sort.Slice(source.Adapters, func(i, j int) bool {
		return source.Adapters[i].ID+source.Adapters[i].Version < source.Adapters[j].ID+source.Adapters[j].Version
	})
	data, err := json.Marshal(source)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}

func findPlatform(values []PlatformBundle, version string) (PlatformBundle, bool) {
	for _, value := range values {
		if value.Version == version {
			return value, true
		}
	}
	return PlatformBundle{}, false
}

// PlatformBundle is released atomically: core, official services, defaults and
// compatible binaries are one platform decision, not independently guessed.
type PlatformBundle struct {
	ID       string                            `json:"id"`
	Version  string                            `json:"version"`
	Package  string                            `json:"package"`
	SHA256   string                            `json:"sha256"`
	Tarball  string                            `json:"tarball"`
	SDKRange string                            `json:"sdkRange,omitempty"`
	Profiles map[string]contracts.ServiceGraph `json:"profiles"`
	Requires []Requirement                     `json:"requires,omitempty"`
	Config   []ConfigRequirement               `json:"config,omitempty"`
	Binaries []Binary                          `json:"binaries,omitempty"`
	Members  []Component                       `json:"members,omitempty"`
	// Toolchain is the release-declared runtime contract. It exists so a
	// platform can move to a new Node/pnpm major without shipping a new
	// launcher: the launcher reads the requirement, it does not embed it.
	Toolchain *ToolchainRequirement `json:"toolchain,omitempty"`
}

// ToolchainRequirement states the runtime a platform bundle is installable
// under, plus the managed runtime artifacts the release ships when a
// conforming system runtime is not present.
type ToolchainRequirement struct {
	NodeMajor int      `json:"nodeMajor"`
	PnpmMajor int      `json:"pnpmMajor"`
	Managed   []Binary `json:"managed,omitempty"`
}

// ManagedFor selects the managed toolchain artifacts published for one target,
// rejecting a target outside the supported matrix rather than reporting it as
// simply absent.
func (t *ToolchainRequirement) ManagedFor(os, arch string) ([]Binary, error) {
	if t == nil {
		return nil, nil
	}
	if !contracts.SupportedTarget(os, arch) {
		return nil, contracts.ReleaseError(contracts.CodeReleaseTargetUnsupported, contracts.StageResolve,
			"the local platform is outside the supported release matrix",
			"supported targets are linux/amd64, linux/arm64, darwin/amd64, darwin/arm64",
			fmt.Errorf("target %s/%s is not released", os, arch)).WithDetail("target", os+"/"+arch)
	}
	result := make([]Binary, 0, len(t.Managed))
	for _, binary := range t.Managed {
		if binary.OS == os && binary.Arch == arch {
			result = append(result, binary)
		}
	}
	return result, nil
}

// Binary is release-owned tooling required by a platform bundle. URLs and
// hashes are immutable release assets, never guessed from a "latest" tag.
type Binary struct {
	ID       string `json:"id"`
	OS       string `json:"os"`
	Arch     string `json:"arch"`
	URL      string `json:"url"`
	SHA256   string `json:"sha256"`
	Filename string `json:"filename"`
}

type Component struct {
	ID            string              `json:"id"`
	Version       string              `json:"version"`
	Package       string              `json:"package"`
	SHA256        string              `json:"sha256"`
	Tarball       string              `json:"tarball"`
	PlatformRange string              `json:"platformRange,omitempty"`
	SDKRange      string              `json:"sdkRange,omitempty"`
	Requires      []Requirement       `json:"requires,omitempty"`
	Config        []ConfigRequirement `json:"config,omitempty"`
}

type Adapter struct {
	Component
	Provides []string `json:"provides"`
}

type Requirement struct {
	Capability string `json:"capability"`
	RequiredBy string `json:"requiredBy,omitempty"`
}

// ConfigRequirement is exported from a selected artifact manifest. It is the
// only authority allowed to map a scenario/CI answer into generated config.
type ConfigRequirement struct {
	ID       string   `json:"id"`
	Path     string   `json:"path,omitempty"`
	Required bool     `json:"required,omitempty"`
	Secret   bool     `json:"secret,omitempty"`
	Default  string   `json:"default,omitempty"` // JSON literal, never a secret
	Env      string   `json:"env,omitempty"`
	Services []string `json:"services,omitempty"`
}

// SolePlatform returns the single platform bundle of a channel-independent
// index. Channel selection happens upstream in the pointer/descriptor layer,
// so by the time an index is in hand the release it describes is already
// chosen; an index shipping more than one platform is ambiguous and must be
// installed by exact version instead of guessed.
func SolePlatform(source Catalog) (PlatformBundle, error) {
	if len(source.Platforms) == 1 {
		return source.Platforms[0], nil
	}
	return PlatformBundle{}, fmt.Errorf("release index ships %d platform bundles; select one with an exact version", len(source.Platforms))
}

// SoleSDK is the SDK equivalent of SolePlatform. An absent SDK is not an
// error: not every release ships one.
func SoleSDK(source Catalog) (Component, bool) {
	if len(source.SDKs) == 1 {
		return source.SDKs[0], true
	}
	return Component{}, false
}
