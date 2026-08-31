// Package remote resolves a release from the published control plane:
// channel pointer -> immutable descriptor -> release index. Every hop is
// digest-verified before any byte of it is used for a resolution decision, and
// there is no branch that retries an older document format.
package remote

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/kb-labs/create/v2/catalog"
	"github.com/kb-labs/create/v2/contracts"
)

// Deterministic public layout. Descriptors address artifacts base-relative, so
// the launcher — not the document — owns the base and this layout. Migrating
// hosting is then a base change plus a pointer republish; every immutable
// descriptor already published stays resolvable.
const (
	ChannelPath       = "channels/%s.json"
	ReleasePath       = "releases/%s/release.json"
	SupportPolicyPath = "support.json"
)

// Fetcher is the injectable transport boundary. Tests supply an in-process
// double; the launcher supplies HTTPFetcher. Nothing in this package reaches
// the network directly.
type Fetcher interface {
	Fetch(ctx context.Context, url string) ([]byte, error)
}

// HTTPFetcher is the production transport. A missing document is reported as
// ErrNotFound so callers can distinguish "channel does not exist" from
// "the endpoint is broken" without inspecting message text.
type HTTPFetcher struct {
	Client *http.Client
}

// ErrNotFound marks an absent document at a reachable endpoint.
var ErrNotFound = fmt.Errorf("release document not found")

func (f HTTPFetcher) Fetch(ctx context.Context, url string) ([]byte, error) {
	client := f.Client
	if client == nil {
		client = &http.Client{Timeout: 60 * time.Second}
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer func() { _ = response.Body.Close() }()
	data, readErr := io.ReadAll(response.Body)
	if response.StatusCode == http.StatusNotFound || response.StatusCode == http.StatusGone {
		return nil, fmt.Errorf("%w: %s", ErrNotFound, url)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("release endpoint returned status %d for %s", response.StatusCode, url)
	}
	if readErr != nil {
		return nil, readErr
	}
	return data, nil
}

// Source is the trusted release endpoint the launcher is configured with.
type Source struct {
	// Base is the trusted origin every base-relative document path resolves
	// against. It is launcher configuration, never document content.
	Base    string
	Fetcher Fetcher
	// CacheDir receives the verified index bytes. Empty means a fresh
	// temporary directory owned by the process.
	CacheDir string
}

// Resolution is the fully verified result of one release lookup. Callers
// persist ReleaseID and IndexSHA256 in the journal so recovery replays the
// same decision instead of re-resolving a channel that has since moved.
type Resolution struct {
	Channel     contracts.Channel
	Pointer     *contracts.ReleaseChannelPointer
	Descriptor  contracts.ReleaseDescriptor
	Catalog     catalog.Catalog
	IndexPath   string
	IndexSHA256 string
}

// ResolveChannel follows pointer -> descriptor -> index. Resolving a channel
// pointer is itself the support statement for that release, so this path
// deliberately never reads ReleaseSupportPolicy: an unavailable mutable
// support document must not be able to block every new installation.
func (s Source) ResolveChannel(ctx context.Context, channel contracts.Channel) (Resolution, error) {
	if err := s.validate(); err != nil {
		return Resolution{}, err
	}
	if channel != contracts.ChannelStable && channel != contracts.ChannelCanary && channel != contracts.ChannelExperimental {
		return Resolution{}, contracts.ReleaseError(contracts.CodeReleaseChannelAbsent, contracts.StageResolve,
			"requested release channel is not a published channel",
			"use stable, canary or experimental",
			fmt.Errorf("unknown channel %q", channel)).WithDetail("channel", string(channel))
	}
	pointerBytes, err := s.fetch(ctx, fmt.Sprintf(ChannelPath, channel))
	if err != nil {
		return Resolution{}, contracts.ReleaseError(contracts.CodeReleaseChannelAbsent, contracts.StageResolve,
			"release channel pointer is not available",
			"retry later, or install an exact version with --platform-version",
			err).WithDetail("channel", string(channel))
	}
	var pointer contracts.ReleaseChannelPointer
	if err := json.Unmarshal(pointerBytes, &pointer); err != nil {
		return Resolution{}, contracts.ReleaseError(contracts.CodeReleaseChannelAbsent, contracts.StageResolve,
			"release channel pointer is not valid JSON",
			"retry later; the channel pointer is being republished",
			err).WithDetail("channel", string(channel))
	}
	if err := pointer.Validate(); err != nil {
		return Resolution{}, legacyDocument("release channel pointer", err).WithDetail("channel", string(channel))
	}
	descriptor, err := s.descriptorFrom(ctx, pointer.Release, pointer.ReleaseID)
	if err != nil {
		return Resolution{}, err
	}
	resolution, err := s.indexFrom(ctx, descriptor)
	if err != nil {
		return Resolution{}, err
	}
	resolution.Channel, resolution.Pointer = channel, &pointer
	return resolution, nil
}

// ResolveRelease resolves an exact release ID straight to its immutable
// descriptor. Callers that install by exact version must additionally consult
// SupportPolicy: without a pointer there is no implicit support statement.
func (s Source) ResolveRelease(ctx context.Context, releaseID string) (Resolution, error) {
	if err := s.validate(); err != nil {
		return Resolution{}, err
	}
	if strings.TrimSpace(releaseID) == "" {
		return Resolution{}, contracts.ReleaseError(contracts.CodeInputRequired, contracts.StageResolve,
			"an exact release ID is required", "pass --platform-version <releaseId>", nil)
	}
	data, err := s.fetch(ctx, fmt.Sprintf(ReleasePath, releaseID))
	if err != nil {
		return Resolution{}, contracts.ReleaseError(contracts.CodeReleaseDescriptorUnavailable, contracts.StageResolve,
			"release descriptor is not available",
			"check the release ID, or install from a channel with --platform-channel",
			err).WithDetail("releaseId", releaseID)
	}
	descriptor, err := decodeDescriptor(data, releaseID)
	if err != nil {
		return Resolution{}, err
	}
	return s.indexFrom(ctx, descriptor)
}

// SupportPolicy reads the mutable lifecycle document. Its unavailability is
// reported as a typed error so each caller can apply the §7.4 rule for its own
// operation: fail closed for exact-version installs, degrade for status.
func (s Source) SupportPolicy(ctx context.Context) (contracts.ReleaseSupportPolicy, error) {
	if err := s.validate(); err != nil {
		return contracts.ReleaseSupportPolicy{}, err
	}
	data, err := s.fetch(ctx, SupportPolicyPath)
	if err != nil {
		return contracts.ReleaseSupportPolicy{}, contracts.ReleaseError(contracts.CodeSupportPolicyUnavailable, contracts.StageResolve,
			"release support policy is not available",
			"retry later; support status cannot be confirmed right now", err)
	}
	var policy contracts.ReleaseSupportPolicy
	if err := json.Unmarshal(data, &policy); err != nil {
		return contracts.ReleaseSupportPolicy{}, contracts.ReleaseError(contracts.CodeSupportPolicyUnavailable, contracts.StageResolve,
			"release support policy is not valid JSON",
			"retry later; the support policy is being republished", err)
	}
	if err := policy.Validate(); err != nil {
		return contracts.ReleaseSupportPolicy{}, contracts.ReleaseError(contracts.CodeSupportPolicyUnavailable, contracts.StageResolve,
			"release support policy failed validation",
			"retry later; support status cannot be confirmed right now", err)
	}
	return policy, nil
}

func (s Source) descriptorFrom(ctx context.Context, reference contracts.PointerReference, expectedReleaseID string) (contracts.ReleaseDescriptor, error) {
	data, err := s.fetch(ctx, reference.Path)
	if err != nil {
		return contracts.ReleaseDescriptor{}, contracts.ReleaseError(contracts.CodeReleaseDescriptorUnavailable, contracts.StageResolve,
			"release descriptor referenced by the channel pointer is not available",
			"retry later; the channel points at a release whose descriptor is not readable",
			err).WithDetail("releaseId", expectedReleaseID)
	}
	if err := verifyDigest("release descriptor", reference.SHA256, data); err != nil {
		return contracts.ReleaseDescriptor{}, err
	}
	return decodeDescriptor(data, expectedReleaseID)
}

func decodeDescriptor(data []byte, expectedReleaseID string) (contracts.ReleaseDescriptor, error) {
	var descriptor contracts.ReleaseDescriptor
	if err := json.Unmarshal(data, &descriptor); err != nil {
		return contracts.ReleaseDescriptor{}, contracts.ReleaseError(contracts.CodeReleaseDescriptorUnavailable, contracts.StageResolve,
			"release descriptor is not valid JSON",
			"retry later; the descriptor is being republished", err)
	}
	if err := descriptor.Validate(); err != nil {
		return contracts.ReleaseDescriptor{}, legacyDocument("release descriptor", err).WithDetail("releaseId", expectedReleaseID)
	}
	if expectedReleaseID != "" && descriptor.ReleaseID != expectedReleaseID {
		return contracts.ReleaseDescriptor{}, contracts.ReleaseError(contracts.CodeReleaseDigestMismatch, contracts.StageResolve,
			"release descriptor does not describe the requested release",
			"retry later; the pointer and descriptor disagree about the release identity",
			fmt.Errorf("descriptor declares %q, expected %q", descriptor.ReleaseID, expectedReleaseID))
	}
	return descriptor, nil
}

func (s Source) indexFrom(ctx context.Context, descriptor contracts.ReleaseDescriptor) (Resolution, error) {
	data, err := s.fetch(ctx, descriptor.Index.Path)
	if err != nil {
		return Resolution{}, contracts.ReleaseError(contracts.CodeReleaseIndexInvalid, contracts.StageResolve,
			"release index referenced by the descriptor is not available",
			"retry later; the release index is not readable from the configured endpoint",
			err).WithDetail("releaseId", descriptor.ReleaseID)
	}
	// Digest before parse: the index must be proven to be the exact bytes the
	// immutable descriptor names before a single field of it informs a choice.
	if err := verifyDigest("release index", descriptor.Index.SHA256, data); err != nil {
		return Resolution{}, err
	}
	source, err := catalog.Decode(data)
	if err != nil {
		if contracts.CodeOf(err) == contracts.CodeReleaseSchemaUnsupported {
			return Resolution{}, legacyDocument("release index", err).WithDetail("releaseId", descriptor.ReleaseID)
		}
		return Resolution{}, err
	}
	path, err := s.persist(descriptor.ReleaseID, data)
	if err != nil {
		return Resolution{}, contracts.ReleaseError(contracts.CodeReleaseIndexInvalid, contracts.StageResolve,
			"verified release index could not be stored locally",
			"check that the launcher cache directory is writable", err)
	}
	return Resolution{Descriptor: descriptor, Catalog: source, IndexPath: path, IndexSHA256: descriptor.Index.SHA256}, nil
}

// persist writes the verified index next to the resolution so a failure
// dossier and a later recovery can read the exact document that was used.
func (s Source) persist(releaseID string, data []byte) (string, error) {
	directory := s.CacheDir
	if directory == "" {
		created, err := os.MkdirTemp("", "kb-create-release-")
		if err != nil {
			return "", err
		}
		directory = created
	}
	if err := os.MkdirAll(directory, 0o750); err != nil {
		return "", err
	}
	target := filepath.Join(directory, sanitize(releaseID)+"-release-index.json")
	if err := os.WriteFile(target, data, 0o600); err != nil {
		return "", err
	}
	return target, nil
}

func (s Source) validate() error {
	if strings.TrimSpace(s.Base) == "" {
		return contracts.ReleaseError(contracts.CodeInputRequired, contracts.StageResolve,
			"no trusted release endpoint is configured",
			"pass --release-base <url>, or install from an exact index with --index", nil)
	}
	if s.Fetcher == nil {
		return contracts.ReleaseError(contracts.CodeInputRequired, contracts.StageResolve,
			"release source has no transport", "configure a release transport", nil)
	}
	return nil
}

func (s Source) fetch(ctx context.Context, relative string) ([]byte, error) {
	if strings.HasPrefix(relative, "/") || strings.Contains(relative, "..") || strings.Contains(relative, "://") {
		return nil, fmt.Errorf("document path %q is not base-relative", relative)
	}
	return s.Fetcher.Fetch(ctx, strings.TrimRight(s.Base, "/")+"/"+path.Clean(relative))
}

// verifyDigest compares the SHA-256 of the exact fetched bytes with the digest
// the referring document declared. Raw bytes rather than a re-serialisation:
// that is what the TypeScript sealer hashes, and what a shell installer can
// reproduce with sha256sum.
func verifyDigest(document, expected string, data []byte) error {
	sum := sha256.Sum256(data)
	actual := hex.EncodeToString(sum[:])
	if !strings.EqualFold(expected, actual) {
		return contracts.ReleaseError(contracts.CodeReleaseDigestMismatch, contracts.StageResolve,
			document+" does not match the digest that references it",
			"retry later; a mismatching digest means the document is stale, truncated or tampered with",
			fmt.Errorf("expected %s, got %s", expected, actual)).
			WithDetail("document", document).
			WithDetail("expectedSha256", expected).
			WithDetail("actualSha256", actual)
	}
	return nil
}

// legacyDocument converts a schema/shape rejection into the legacy-epoch
// diagnostic. A pre-cutover release is recognised exactly here — by schema
// mismatch — and never by absence from a support list.
func legacyDocument(document string, cause error) *contracts.LauncherError {
	return contracts.ReleaseError(contracts.CodeReleaseLegacyUnsupported, contracts.StageResolve,
		document+" was published under a retired release contract",
		"reinstall the platform with the current installer; this release predates the current contract and cannot be resolved",
		cause).WithDetail("document", document)
}

func sanitize(value string) string {
	replaced := strings.Map(func(character rune) rune {
		switch {
		case character >= 'a' && character <= 'z', character >= 'A' && character <= 'Z',
			character >= '0' && character <= '9', character == '-', character == '.', character == '_':
			return character
		default:
			return '-'
		}
	}, value)
	if replaced == "" {
		return "release"
	}
	return replaced
}
