package contracts

import "testing"

func policy() ReleaseSupportPolicy {
	return ReleaseSupportPolicy{
		Schema:           ReleaseSupportPolicySchema,
		Contract:         ReleaseDescriptorSchema,
		MinimumSupported: "platform-2.120.0",
		Supported:        []string{"platform-2.120.0", "platform-2.121.0"},
		Retired:          []RetiredRelease{{ReleaseID: "platform-2.119.0", Reason: "superseded", ReplacedBy: "platform-2.120.0"}},
		LegacyNotice:     "Reinstall with: curl -fsSL https://kblabs.ru/install.sh | sh",
		GeneratedAt:      "2026-08-30T00:00:00Z",
	}
}

// The three §7.3 failure mechanisms must stay distinguishable: a retired
// release and a reserved-but-never-activated canary are different states, and
// collapsing them turns the supported list into a log of failed smoke runs.
func TestEvaluateSupportSeparatesRetiredFromNeverActivated(t *testing.T) {
	document := policy()
	if decision := document.EvaluateSupport("platform-2.120.0"); decision.Status != SupportSupported || decision.DiagnosticCode() != "" {
		t.Fatalf("supported = %#v", decision)
	}
	retired := document.EvaluateSupport("platform-2.119.0")
	if retired.Status != SupportRetired || retired.DiagnosticCode() != CodeReleaseRetired || retired.ReplacedBy != "platform-2.120.0" {
		t.Fatalf("retired = %#v", retired)
	}
	burned := document.EvaluateSupport("platform-2.122.0-canary.abc")
	if burned.Status != SupportNotActivated || burned.DiagnosticCode() != CodeReleaseNotActivated {
		t.Fatalf("burned canary = %#v", burned)
	}
	// The notice is rendered from the document, never from a launcher copy.
	if burned.Notice != document.LegacyNotice {
		t.Fatalf("notice = %q", burned.Notice)
	}
}

// A burned version must never be published into either list; if it were, the
// supported list would become a journal of failed promotions.
func TestValidateRejectsReleaseInBothLists(t *testing.T) {
	document := policy()
	document.Retired = append(document.Retired, RetiredRelease{ReleaseID: "platform-2.120.0", Reason: "superseded"})
	if err := document.Validate(); err == nil {
		t.Fatal("expected a release listed as both supported and retired to be rejected")
	}
}

func TestValidateRejectsPreCutoverContract(t *testing.T) {
	document := policy()
	document.Contract = "kb.release/0"
	if err := document.Validate(); err == nil {
		t.Fatal("expected a policy for a different contract to be rejected")
	}
}

func TestDescriptorRejectsUnsupportedLauncherTarget(t *testing.T) {
	descriptor := ReleaseDescriptor{
		Schema: ReleaseDescriptorSchema, ReleaseID: "platform-2.120.0", CandidateID: "c",
		BundleSHA256: hex64('a'),
		Index:        PointerReference{Path: "platform/2.120.0/release-index.json", SHA256: hex64('b')},
		Launcher: ReleaseLauncher{Version: "2.120.0", Artifacts: []LauncherArtifact{
			{OS: "windows", Arch: "amd64", Path: "platform/kb-create.exe", SHA256: hex64('c')},
		}},
		PreparedAt: "2026-08-30T00:00:00Z",
	}
	if err := descriptor.Validate(); err == nil {
		t.Fatal("expected a windows launcher artifact to be rejected")
	}
}

// Descriptors address artifacts base-relative so hosting can migrate without
// invalidating every immutable descriptor already published.
func TestPointerReferenceRejectsAbsoluteAddress(t *testing.T) {
	reference := PointerReference{Path: "https://cdn.test/release.json", SHA256: hex64('a')}
	if err := reference.Validate("index"); err == nil {
		t.Fatal("expected an absolute URL to be rejected")
	}
}

func TestSupportedTargetIsTheFourReleasedCombinations(t *testing.T) {
	for _, target := range [][2]string{{"linux", "amd64"}, {"linux", "arm64"}, {"darwin", "amd64"}, {"darwin", "arm64"}} {
		if !SupportedTarget(target[0], target[1]) {
			t.Fatalf("%v should be supported", target)
		}
	}
	for _, target := range [][2]string{{"windows", "amd64"}, {"linux", "386"}, {"darwin", "riscv64"}} {
		if SupportedTarget(target[0], target[1]) {
			t.Fatalf("%v should not be supported", target)
		}
	}
}

func TestCodeOfReadsTypedDiagnosticWithoutMessageMatching(t *testing.T) {
	err := ReleaseError(CodeReleaseDigestMismatch, StageResolve, "message", "hint", nil).WithDetail("document", "release index")
	if CodeOf(err) != CodeReleaseDigestMismatch || err.Details["document"] != "release index" {
		t.Fatalf("error = %#v", err)
	}
	if CodeOf(nil) != "" {
		t.Fatal("nil error has no code")
	}
}

func hex64(character byte) string {
	value := make([]byte, 64)
	for index := range value {
		value[index] = character
	}
	return string(value)
}
