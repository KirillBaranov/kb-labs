package runtime

import "testing"

func TestValidateNodeVersionAcceptsOnlySupportedMajor(t *testing.T) {
	if err := ValidateNodeVersion("v24.18.0"); err != nil {
		t.Fatalf("expected Node 24 to be supported: %v", err)
	}
	for _, version := range []string{"v20.18.0", "v22.13.0", "v26.0.0"} {
		if err := ValidateNodeVersion(version); err == nil {
			t.Fatalf("expected %s to be rejected", version)
		}
	}
}

func TestValidateNodeVersionRejectsMalformedVersion(t *testing.T) {
	if err := ValidateNodeVersion("not-a-version"); err == nil {
		t.Fatal("expected malformed version to be rejected")
	}
}
