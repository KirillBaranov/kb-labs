package toolchain

import (
	"strings"
	"testing"
)

func TestValidateNodeAcceptsOnlySupportedMajor(t *testing.T) {
	if err := ValidateNode("v24.18.0"); err != nil {
		t.Fatal(err)
	}
	for _, version := range []string{"v20.18.0", "v22.13.0", "v26.0.0"} {
		if err := ValidateNode(version); err == nil {
			t.Fatalf("%s must be rejected", version)
		}
	}
}

func TestConfirmUpdateIsOptIn(t *testing.T) {
	issue := &ValidationError{Tool: "Node.js", Detected: "v20.18.0", Requirement: "Node.js 24.x", Remediation: NodeRemediation()}
	var out strings.Builder
	if ConfirmUpdate(strings.NewReader("n\n"), &out, issue) {
		t.Fatal("negative answer must not approve update")
	}
	if !strings.Contains(out.String(), "Would you like to update now? [y/N]") {
		t.Fatalf("missing prompt: %q", out.String())
	}
	if !ConfirmUpdate(strings.NewReader("yes\n"), &strings.Builder{}, issue) {
		t.Fatal("yes must approve an update")
	}
}
