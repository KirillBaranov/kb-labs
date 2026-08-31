package contracts

import (
	"fmt"
	"strings"
)

// Release control plane document schemas. These identifiers are the wire
// contract shared with the TypeScript release plugin
// (plugins/release/manager-contracts/src/schema/release-control-plane.schema.ts);
// any divergence here is an interop break, not a local naming choice.
const (
	ReleaseDescriptorSchema     = "kb.release/1"
	ReleaseChannelPointerSchema = "kb.release-channel/1"
	ReleaseSupportPolicySchema  = "kb.release-support/1"
)

// Release diagnostic codes mirrored from the TypeScript ReleaseDiagnosticCode
// map. They are the only vocabulary allowed to distinguish a pre-cutover
// legacy release from an in-contract retirement from a reserved-but-never
// activated canary.
const (
	CodeReleaseLegacyUnsupported = "KB_CREATE_RELEASE_LEGACY_UNSUPPORTED"
	CodeReleaseRetired           = "KB_CREATE_RELEASE_RETIRED"
	CodeReleaseNotActivated      = "KB_CREATE_RELEASE_NOT_ACTIVATED"
)

// Supported delivery matrix (decision S0.3c): linux and darwin on amd64 and
// arm64. Windows is not a supported target and is rejected with a typed
// diagnostic rather than silently resolving to nothing.
var (
	supportedReleaseOS   = map[string]bool{"linux": true, "darwin": true}
	supportedReleaseArch = map[string]bool{"amd64": true, "arm64": true}
)

// SupportedTarget reports whether {os, arch} is inside the released matrix.
func SupportedTarget(os, arch string) bool {
	return supportedReleaseOS[os] && supportedReleaseArch[arch]
}

// SupportedTargets renders the matrix for human-facing diagnostics.
func SupportedTargets() []string {
	return []string{"linux/amd64", "linux/arm64", "darwin/amd64", "darwin/arm64"}
}

// PointerReference addresses one release document or artifact as a
// base-relative path plus the SHA-256 of its exact bytes. Absolute URLs are
// deliberately absent: an immutable descriptor that embedded a host would be
// unresolvable after a hosting migration, while a base-relative path only
// requires republishing the mutable pointer.
type PointerReference struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
}

func (r PointerReference) Validate(field string) error {
	if err := validateRelativePath(field+".path", r.Path); err != nil {
		return err
	}
	return validateSHA256(field+".sha256", r.SHA256)
}

// ReleaseChannelPointer is the only mutable channel surface. Resolving it to a
// descriptor is by itself proof that the release is supported, which is why
// channel installation never consults ReleaseSupportPolicy.
type ReleaseChannelPointer struct {
	Schema    string           `json:"schema"`
	Channel   Channel          `json:"channel"`
	ReleaseID string           `json:"releaseId"`
	Release   PointerReference `json:"release"`
	Signature *string          `json:"signature,omitempty"`
}

func (p ReleaseChannelPointer) Validate() error {
	if p.Schema != ReleaseChannelPointerSchema {
		return unsupportedSchema("release channel pointer", p.Schema, ReleaseChannelPointerSchema)
	}
	if p.Channel != ChannelStable && p.Channel != ChannelCanary && p.Channel != ChannelExperimental {
		return fmt.Errorf("release channel pointer declares unsupported channel %q", p.Channel)
	}
	if strings.TrimSpace(p.ReleaseID) == "" {
		return fmt.Errorf("release channel pointer must declare releaseId")
	}
	return p.Release.Validate("release")
}

// LauncherArtifact is one launcher binary published for an exact target.
type LauncherArtifact struct {
	OS     string `json:"os"`
	Arch   string `json:"arch"`
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
}

type ReleaseLauncher struct {
	Version   string             `json:"version"`
	Artifacts []LauncherArtifact `json:"artifacts"`
}

// ReleaseDescriptor is the immutable public identity of one release. It is
// produced and sealed by the release plugin and republished byte-for-byte by
// CI; kb-create never reconstructs it.
type ReleaseDescriptor struct {
	Schema       string           `json:"schema"`
	ReleaseID    string           `json:"releaseId"`
	CandidateID  string           `json:"candidateId"`
	BundleSHA256 string           `json:"bundleSha256"`
	Index        PointerReference `json:"index"`
	Launcher     ReleaseLauncher  `json:"launcher"`
	PreparedAt   string           `json:"preparedAt"`
	Signature    *string          `json:"signature,omitempty"`
}

func (d ReleaseDescriptor) Validate() error {
	if d.Schema != ReleaseDescriptorSchema {
		return unsupportedSchema("release descriptor", d.Schema, ReleaseDescriptorSchema)
	}
	if strings.TrimSpace(d.ReleaseID) == "" || strings.TrimSpace(d.CandidateID) == "" {
		return fmt.Errorf("release descriptor must declare releaseId and candidateId")
	}
	if err := validateSHA256("bundleSha256", d.BundleSHA256); err != nil {
		return err
	}
	if err := d.Index.Validate("index"); err != nil {
		return err
	}
	if strings.TrimSpace(d.Launcher.Version) == "" {
		return fmt.Errorf("release descriptor must declare launcher.version")
	}
	if len(d.Launcher.Artifacts) == 0 {
		return fmt.Errorf("release descriptor must declare at least one launcher artifact")
	}
	for _, artifact := range d.Launcher.Artifacts {
		if !SupportedTarget(artifact.OS, artifact.Arch) {
			return fmt.Errorf("release descriptor declares unsupported launcher target %s/%s", artifact.OS, artifact.Arch)
		}
		if err := validateRelativePath("launcher.artifacts.path", artifact.Path); err != nil {
			return err
		}
		if err := validateSHA256("launcher.artifacts.sha256", artifact.SHA256); err != nil {
			return err
		}
	}
	if strings.TrimSpace(d.PreparedAt) == "" {
		return fmt.Errorf("release descriptor must declare preparedAt")
	}
	return nil
}

// Launcher selects the launcher artifact for one target, rejecting anything
// outside the supported matrix before it can be mistaken for a missing entry.
func (d ReleaseDescriptor) LauncherFor(os, arch string) (LauncherArtifact, error) {
	if !SupportedTarget(os, arch) {
		return LauncherArtifact{}, fmt.Errorf("target %s/%s is outside the supported matrix (%s)", os, arch, strings.Join(SupportedTargets(), ", "))
	}
	for _, artifact := range d.Launcher.Artifacts {
		if artifact.OS == os && artifact.Arch == arch {
			return artifact, nil
		}
	}
	return LauncherArtifact{}, fmt.Errorf("release %s publishes no launcher for %s/%s", d.ReleaseID, os, arch)
}

type RetiredRelease struct {
	ReleaseID  string `json:"releaseId"`
	Reason     string `json:"reason"`
	ReplacedBy string `json:"replacedBy,omitempty"`
}

// ReleaseSupportPolicy is a mutable lifecycle document. Its scope is
// deliberately narrow: exact-version installation, evaluation of an installed
// release and status. Channel resolution never reads it, so its unavailability
// cannot become a denial of service for new installations.
type ReleaseSupportPolicy struct {
	Schema           string           `json:"schema"`
	Contract         string           `json:"contract"`
	MinimumSupported string           `json:"minimumSupported"`
	Supported        []string         `json:"supported"`
	Retired          []RetiredRelease `json:"retired"`
	LegacyNotice     string           `json:"legacyNotice"`
	GeneratedAt      string           `json:"generatedAt"`
	Signature        *string          `json:"signature,omitempty"`
}

func (p ReleaseSupportPolicy) Validate() error {
	if p.Schema != ReleaseSupportPolicySchema {
		return unsupportedSchema("release support policy", p.Schema, ReleaseSupportPolicySchema)
	}
	if p.Contract != ReleaseDescriptorSchema {
		return unsupportedSchema("release support policy contract", p.Contract, ReleaseDescriptorSchema)
	}
	if strings.TrimSpace(p.MinimumSupported) == "" {
		return fmt.Errorf("release support policy must declare minimumSupported")
	}
	if strings.TrimSpace(p.LegacyNotice) == "" {
		return fmt.Errorf("release support policy must declare legacyNotice")
	}
	if strings.TrimSpace(p.GeneratedAt) == "" {
		return fmt.Errorf("release support policy must declare generatedAt")
	}
	retired := make(map[string]bool, len(p.Retired))
	for _, item := range p.Retired {
		if strings.TrimSpace(item.ReleaseID) == "" || strings.TrimSpace(item.Reason) == "" {
			return fmt.Errorf("retired release must declare releaseId and reason")
		}
		if retired[item.ReleaseID] {
			return fmt.Errorf("duplicate retired release %q", item.ReleaseID)
		}
		retired[item.ReleaseID] = true
	}
	for _, releaseID := range p.Supported {
		if strings.TrimSpace(releaseID) == "" {
			return fmt.Errorf("supported release must not be empty")
		}
		// A burned canary never activated and a retired release are different
		// states; a release that is both supported and retired makes the
		// support answer non-deterministic.
		if retired[releaseID] {
			return fmt.Errorf("release %q is both supported and retired", releaseID)
		}
	}
	return nil
}

// SupportStatus is the launcher-visible lifecycle answer for one release.
type SupportStatus string

const (
	SupportSupported    SupportStatus = "supported"
	SupportRetired      SupportStatus = "retired"
	SupportNotActivated SupportStatus = "not-activated"
	SupportUnknown      SupportStatus = "unknown"
)

// SupportDecision carries the rendered lifecycle answer. Notice text always
// comes from the document so a reworded message never requires a new launcher.
type SupportDecision struct {
	Status     SupportStatus `json:"supportStatus"`
	Contract   string        `json:"contract"`
	ReleaseID  string        `json:"releaseId,omitempty"`
	ReplacedBy string        `json:"replacedBy,omitempty"`
	Reason     string        `json:"reason,omitempty"`
	Notice     string        `json:"notice,omitempty"`
}

// EvaluateSupport applies the §7.3 failure taxonomy to one release ID.
// A release that appears in neither list existed but was never activated —
// a burned canary — which is a different failure from in-contract retirement.
func (p ReleaseSupportPolicy) EvaluateSupport(releaseID string) SupportDecision {
	decision := SupportDecision{Contract: p.Contract, ReleaseID: releaseID, Notice: p.LegacyNotice}
	for _, supported := range p.Supported {
		if supported == releaseID {
			decision.Status, decision.Notice = SupportSupported, ""
			return decision
		}
	}
	for _, item := range p.Retired {
		if item.ReleaseID == releaseID {
			decision.Status, decision.Reason, decision.ReplacedBy = SupportRetired, item.Reason, item.ReplacedBy
			return decision
		}
	}
	decision.Status = SupportNotActivated
	return decision
}

// DiagnosticCode maps a support decision onto the shared error taxonomy.
func (d SupportDecision) DiagnosticCode() string {
	switch d.Status {
	case SupportRetired:
		return CodeReleaseRetired
	case SupportNotActivated:
		return CodeReleaseNotActivated
	default:
		return ""
	}
}

func validateRelativePath(field, value string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s is required", field)
	}
	if strings.HasPrefix(value, "/") || strings.Contains(value, "..") || strings.Contains(value, "://") {
		return fmt.Errorf("%s must be a base-relative path, got %q", field, value)
	}
	return nil
}

func validateSHA256(field, value string) error {
	if len(value) != 64 {
		return fmt.Errorf("%s must be lowercase SHA-256 hex", field)
	}
	for _, character := range value {
		if (character < '0' || character > '9') && (character < 'a' || character > 'f') {
			return fmt.Errorf("%s must be lowercase SHA-256 hex", field)
		}
	}
	return nil
}

// unsupportedSchema is the single place that phrases a schema mismatch. A
// document from before the cutover is recognised here, by schema, and never by
// membership in a support list.
func unsupportedSchema(document, actual, expected string) error {
	if strings.TrimSpace(actual) == "" {
		actual = "<absent>"
	}
	return fmt.Errorf("unsupported %s schema %q, expected %q", document, actual, expected)
}
