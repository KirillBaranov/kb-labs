package v2cli

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/kb-labs/create/v2/contracts"
	"github.com/kb-labs/create/v2/remote"
)

// stub is an in-process release endpoint. The §7.4 table is about which
// operations read the support document, so the test controls exactly which
// documents exist rather than which server is reachable.
type stub struct {
	documents map[string][]byte
	reads     *int
}

func (s stub) Fetch(_ context.Context, url string) ([]byte, error) {
	if s.reads != nil {
		*s.reads++
	}
	data, ok := s.documents[url]
	if !ok {
		return nil, remote.ErrNotFound
	}
	return data, nil
}

const stubBase = "https://releases.test"

func withEndpoint(t *testing.T, documents map[string][]byte, reads *int) {
	t.Helper()
	previous := newSource
	newSource = func(base string) remote.Source {
		return remote.Source{Base: base, Fetcher: stub{documents: documents, reads: reads}, CacheDir: t.TempDir()}
	}
	t.Cleanup(func() { newSource = previous })
}

func supportDocument(t *testing.T) []byte {
	t.Helper()
	data, err := json.Marshal(contracts.ReleaseSupportPolicy{
		Schema:           contracts.ReleaseSupportPolicySchema,
		Contract:         contracts.ReleaseDescriptorSchema,
		MinimumSupported: "platform-2.120.0",
		Supported:        []string{"platform-2.120.0"},
		Retired:          []contracts.RetiredRelease{{ReleaseID: "platform-2.119.0", Reason: "superseded", ReplacedBy: "platform-2.120.0"}},
		LegacyNotice:     "Reinstall into a fresh platform root with the current installer.",
		GeneratedAt:      "2026-08-30T00:00:00Z",
	})
	if err != nil {
		t.Fatal(err)
	}
	return data
}

// §7.4 row 1: a channel install must not read the support policy at all. If it
// did, an unavailable mutable document would take down every new install.
func TestChannelInstallNeverReadsSupportPolicy(t *testing.T) {
	withEndpoint(t, map[string][]byte{}, nil)
	_, _, err := resolveRelease("apply", "", stubBase, directRequest{PlatformChannel: "stable"})
	if contracts.CodeOf(err) != contracts.CodeReleaseChannelAbsent {
		t.Fatalf("expected the absent channel to be the only failure, got %v", err)
	}
}

// §7.4 row 2: an exact-version install reads the support policy and fails
// closed when it cannot be read — without a pointer nothing vouches for the
// release.
func TestExactVersionInstallFailsClosedWithoutSupportPolicy(t *testing.T) {
	documents := map[string][]byte{}
	withEndpoint(t, documents, nil)
	_, _, err := resolveRelease("apply", "", stubBase, directRequest{PlatformVersion: "platform-2.120.0"})
	if code := contracts.CodeOf(err); code != contracts.CodeReleaseDescriptorUnavailable && code != contracts.CodeSupportPolicyUnavailable {
		t.Fatalf("expected a fail-closed support decision, got %v", err)
	}
}

// §7.3: a retired release and a canary that was never activated must produce
// different codes, and the retired one must carry its replacement.
func TestSupportDiagnosticsSeparateRetiredFromNeverActivated(t *testing.T) {
	documents := map[string][]byte{stubBase + "/support.json": supportDocument(t)}
	withEndpoint(t, documents, nil)
	source := newSource(stubBase)
	retired := requireSupported(context.Background(), source, "platform-2.119.0")
	if contracts.CodeOf(retired) != contracts.CodeReleaseRetired {
		t.Fatalf("retired = %v", retired)
	}
	var typed *contracts.LauncherError
	if !asLauncher(retired, &typed) || typed.Details["replacedBy"] != "platform-2.120.0" {
		t.Fatalf("retired details = %#v", retired)
	}
	burned := requireSupported(context.Background(), source, "platform-2.130.0-canary.abc")
	if contracts.CodeOf(burned) != contracts.CodeReleaseNotActivated {
		t.Fatalf("burned canary = %v", burned)
	}
	if err := requireSupported(context.Background(), source, "platform-2.120.0"); err != nil {
		t.Fatalf("supported release rejected: %v", err)
	}
}

// §7.4 row 4: status reads the policy but degrades instead of blocking. A user
// whose release left support must be told even when the endpoint is down.
func TestStatusDegradesToUnknownWhenSupportPolicyIsUnavailable(t *testing.T) {
	withEndpoint(t, map[string][]byte{}, nil)
	decision := evaluateInstalledSupport(stubBase, "platform-2.120.0", contracts.ReleaseDescriptorSchema)
	if decision.Status != contracts.SupportUnknown {
		t.Fatalf("decision = %#v", decision)
	}
	withEndpoint(t, map[string][]byte{stubBase + "/support.json": supportDocument(t)}, nil)
	if decision := evaluateInstalledSupport(stubBase, "platform-2.119.0", contracts.ReleaseDescriptorSchema); decision.Status != contracts.SupportRetired {
		t.Fatalf("decision = %#v", decision)
	}
}

// A legacy platform root reports its contract through status and renders the
// notice from the document, never from a string compiled into the launcher.
func TestStatusReportsLegacyContractWithDocumentOwnedNotice(t *testing.T) {
	withEndpoint(t, map[string][]byte{stubBase + "/support.json": supportDocument(t)}, nil)
	decision := evaluateInstalledSupport(stubBase, "", "")
	if decision.Contract != "legacy" || decision.Status != contracts.SupportUnknown {
		t.Fatalf("decision = %#v", decision)
	}
	if decision.Notice != "Reinstall into a fresh platform root with the current installer." {
		t.Fatalf("notice = %q; it must come from the published document", decision.Notice)
	}
}

// --index is an explicit exact/offline source, never a fallback tried after a
// failed remote resolution.
func TestIndexInputIsAnExplicitSourceNotAFallback(t *testing.T) {
	withEndpoint(t, map[string][]byte{}, nil)
	_, _, err := resolveRelease("apply", "/nonexistent/release-index.json", stubBase, directRequest{PlatformChannel: "stable"})
	if contracts.CodeOf(err) != contracts.CodeReleaseIndexInvalid {
		t.Fatalf("expected the explicit index to be the only source consulted, got %v", err)
	}
}

func asLauncher(err error, target **contracts.LauncherError) bool {
	value, ok := err.(*contracts.LauncherError)
	if ok {
		*target = value
	}
	return ok
}
