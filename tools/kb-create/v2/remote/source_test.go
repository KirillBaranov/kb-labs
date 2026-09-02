package remote

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/kb-labs/create/v2/catalog"
	"github.com/kb-labs/create/v2/contracts"
)

// fake is the in-process transport double. Resolution must be fully testable
// without a deployed endpoint: the launcher only requires *some* trusted
// origin, and choosing that origin is an infrastructure decision, not a
// property of this package.
type fake map[string][]byte

func (f fake) Fetch(_ context.Context, url string) ([]byte, error) {
	data, ok := f[url]
	if !ok {
		return nil, ErrNotFound
	}
	return data, nil
}

const base = "https://releases.test"

func digestOf(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func sealedIndex(t *testing.T) []byte {
	t.Helper()
	source, err := catalog.Seal(catalog.Catalog{
		ReleaseID: "platform-2.120.0",
		Compatibility: &catalog.CompatibilityGraph{
			Schema: catalog.CompatibilityGraphSchema,
			Nodes:  []catalog.GraphNode{{ID: "@kb/platform", Kind: catalog.KindPlatform, Version: "2.120.0"}},
		},
		Platforms: []catalog.PlatformBundle{{
			ID: "platform", Version: "2.120.0", Package: "@kb/platform",
			Tarball: "https://example.test/platform.tgz", SHA256: "artifact",
			Profiles: map[string]contracts.ServiceGraph{"default": {}},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(source)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func published(t *testing.T) (fake, []byte) {
	t.Helper()
	index := sealedIndex(t)
	descriptor := contracts.ReleaseDescriptor{
		Schema:       contracts.ReleaseDescriptorSchema,
		ReleaseID:    "platform-2.120.0",
		CandidateID:  "platform-2.120.0-abc",
		BundleSHA256: digestOf([]byte("bundle")),
		Index:        contracts.PointerReference{Path: "platform/2.120.0/release-index.json", SHA256: digestOf(index)},
		Launcher: contracts.ReleaseLauncher{Version: "2.120.0", Artifacts: []contracts.LauncherArtifact{
			{OS: "darwin", Arch: "arm64", Path: "platform/2.120.0/kb-create-darwin-arm64", SHA256: digestOf([]byte("launcher"))},
		}},
		PreparedAt: "2026-08-30T00:00:00Z",
	}
	descriptorBytes, err := json.Marshal(descriptor)
	if err != nil {
		t.Fatal(err)
	}
	pointer := contracts.ReleaseChannelPointer{
		Schema:    contracts.ReleaseChannelPointerSchema,
		Channel:   contracts.ChannelStable,
		ReleaseID: "platform-2.120.0",
		Release:   contracts.PointerReference{Path: "releases/platform-2.120.0/release.json", SHA256: digestOf(descriptorBytes)},
	}
	pointerBytes, err := json.Marshal(pointer)
	if err != nil {
		t.Fatal(err)
	}
	return fake{
		base + "/channels/stable.json":                   pointerBytes,
		base + "/releases/platform-2.120.0/release.json": descriptorBytes,
		base + "/platform/2.120.0/release-index.json":    index,
	}, descriptorBytes
}

func TestResolveChannelFollowsPointerDescriptorIndex(t *testing.T) {
	documents, _ := published(t)
	source := Source{Base: base, Fetcher: documents, CacheDir: t.TempDir()}
	resolution, err := source.ResolveChannel(context.Background(), contracts.ChannelStable)
	if err != nil {
		t.Fatal(err)
	}
	if resolution.Descriptor.ReleaseID != "platform-2.120.0" || resolution.Catalog.ReleaseID != "platform-2.120.0" {
		t.Fatalf("resolution = %#v", resolution)
	}
	if _, err := os.Stat(resolution.IndexPath); err != nil {
		t.Fatalf("verified index was not persisted: %v", err)
	}
	if resolution.Pointer == nil || resolution.Pointer.Channel != contracts.ChannelStable {
		t.Fatalf("pointer = %#v", resolution.Pointer)
	}
}

func TestResolveChannelReportsAbsentChannel(t *testing.T) {
	documents, _ := published(t)
	source := Source{Base: base, Fetcher: documents, CacheDir: t.TempDir()}
	_, err := source.ResolveChannel(context.Background(), contracts.ChannelCanary)
	if contracts.CodeOf(err) != contracts.CodeReleaseChannelAbsent {
		t.Fatalf("expected absent channel, got %v", err)
	}
}

func TestResolveChannelRejectsDescriptorDigestMismatch(t *testing.T) {
	documents, descriptorBytes := published(t)
	// Republish the descriptor with different bytes than the pointer promised.
	tampered := append(append([]byte(nil), descriptorBytes[:len(descriptorBytes)-1]...), ' ', '}')
	documents[base+"/releases/platform-2.120.0/release.json"] = tampered
	source := Source{Base: base, Fetcher: documents, CacheDir: t.TempDir()}
	_, err := source.ResolveChannel(context.Background(), contracts.ChannelStable)
	if contracts.CodeOf(err) != contracts.CodeReleaseDigestMismatch {
		t.Fatalf("expected digest mismatch, got %v", err)
	}
}

func TestResolveChannelRejectsIndexDigestMismatch(t *testing.T) {
	documents, _ := published(t)
	documents[base+"/platform/2.120.0/release-index.json"] = []byte(`{"schema":"kb.create.release-index/v2"}`)
	source := Source{Base: base, Fetcher: documents, CacheDir: t.TempDir()}
	_, err := source.ResolveChannel(context.Background(), contracts.ChannelStable)
	if contracts.CodeOf(err) != contracts.CodeReleaseDigestMismatch {
		t.Fatalf("expected digest mismatch before parse, got %v", err)
	}
}

// A pre-cutover release is recognised by schema mismatch, never by absence
// from a support list. This is the negative case the PR7 DoD names.
func TestResolveChannelRejectsLegacyIndexFixture(t *testing.T) {
	legacy := []byte(`{"schema":"kb.create.release-index/v1","channels":{"stable":"2.0.0"},"platforms":[{"id":"platform","version":"2.0.0"}]}`)
	index := sealedIndex(t)
	documents, descriptorBytes := published(t)
	_ = index
	_ = descriptorBytes
	// Republish the descriptor so it names the legacy index by its real digest:
	// the failure must come from the schema, not from a digest mismatch.
	var descriptor contracts.ReleaseDescriptor
	if err := json.Unmarshal(documents[base+"/releases/platform-2.120.0/release.json"], &descriptor); err != nil {
		t.Fatal(err)
	}
	descriptor.Index.SHA256 = digestOf(legacy)
	rewritten, err := json.Marshal(descriptor)
	if err != nil {
		t.Fatal(err)
	}
	pointer := contracts.ReleaseChannelPointer{
		Schema: contracts.ReleaseChannelPointerSchema, Channel: contracts.ChannelStable,
		ReleaseID: "platform-2.120.0",
		Release:   contracts.PointerReference{Path: "releases/platform-2.120.0/release.json", SHA256: digestOf(rewritten)},
	}
	pointerBytes, err := json.Marshal(pointer)
	if err != nil {
		t.Fatal(err)
	}
	documents[base+"/releases/platform-2.120.0/release.json"] = rewritten
	documents[base+"/channels/stable.json"] = pointerBytes
	documents[base+"/platform/2.120.0/release-index.json"] = legacy
	source := Source{Base: base, Fetcher: documents, CacheDir: t.TempDir()}
	_, err = source.ResolveChannel(context.Background(), contracts.ChannelStable)
	if contracts.CodeOf(err) != contracts.CodeReleaseLegacyUnsupported {
		t.Fatalf("expected legacy-epoch rejection, got %v", err)
	}
}

func TestResolveReleaseReportsUnavailableDescriptor(t *testing.T) {
	documents, _ := published(t)
	source := Source{Base: base, Fetcher: documents, CacheDir: t.TempDir()}
	_, err := source.ResolveRelease(context.Background(), "platform-9.9.9")
	if contracts.CodeOf(err) != contracts.CodeReleaseDescriptorUnavailable {
		t.Fatalf("expected descriptor unavailable, got %v", err)
	}
}

func TestSupportPolicyRequiresValidDocument(t *testing.T) {
	documents, _ := published(t)
	documents[base+"/support.json"] = []byte(`{"schema":"kb.release-support/0"}`)
	source := Source{Base: base, Fetcher: documents, CacheDir: t.TempDir()}
	if _, err := source.SupportPolicy(context.Background()); contracts.CodeOf(err) != contracts.CodeSupportPolicyUnavailable {
		t.Fatalf("expected support policy rejection, got %v", err)
	}
}

// The launcher must refuse to resolve without a configured trusted endpoint
// rather than defaulting to some discoverable location.
func TestResolveRequiresConfiguredBase(t *testing.T) {
	source := Source{Fetcher: fake{}}
	if _, err := source.ResolveChannel(context.Background(), contracts.ChannelStable); contracts.CodeOf(err) != contracts.CodeInputRequired {
		t.Fatalf("expected missing endpoint, got %v", err)
	}
}

func TestHTTPFetcherReportsNotFoundDistinctly(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/channels/stable.json" {
			_, _ = writer.Write([]byte("{}"))
			return
		}
		writer.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()
	fetcher := HTTPFetcher{Client: server.Client()}
	if _, err := fetcher.Fetch(context.Background(), server.URL+"/channels/stable.json"); err != nil {
		t.Fatal(err)
	}
	if _, err := fetcher.Fetch(context.Background(), server.URL+"/channels/canary.json"); err == nil {
		t.Fatal("expected not found")
	}
}

// A document path is base-relative by contract; a document that tries to
// escape the configured base must not be fetched at all.
func TestFetchRejectsNonRelativeDocumentPath(t *testing.T) {
	source := Source{Base: base, Fetcher: fake{}}
	if _, err := source.fetch(context.Background(), "https://elsewhere.test/release.json"); err == nil {
		t.Fatal("expected absolute path rejection")
	}
	if _, err := source.fetch(context.Background(), "../escape.json"); err == nil {
		t.Fatal("expected traversal rejection")
	}
}
