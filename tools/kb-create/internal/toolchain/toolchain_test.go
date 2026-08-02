package toolchain

import "testing"

func TestValidateAcceptsSupportedVersions(t *testing.T) {
	if err := Validate(Status{NodeVersion: "v24.18.0", PnpmVersion: "11.4.0"}); err != nil {
		t.Fatal(err)
	}
	if err := Validate(Status{NodeVersion: "26.5.0", PnpmVersion: "11.9.0"}); err != nil {
		t.Fatal(err)
	}
}

func TestValidateRejectsOldNode(t *testing.T) {
	if err := Validate(Status{NodeVersion: "20.19.4", PnpmVersion: "11.4.0"}); err == nil {
		t.Fatal("expected old Node.js to be rejected")
	}
}

func TestValidateRejectsPnpmOutsideMajor(t *testing.T) {
	if err := Validate(Status{NodeVersion: "24.18.0", PnpmVersion: "10.9.0"}); err == nil {
		t.Fatal("expected pnpm 10 to be rejected")
	}
}
