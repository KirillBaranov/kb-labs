package contracts

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"
)

func TestCanonicalSHA256MatchesReleaseControlPlaneFixture(t *testing.T) {
	payload, err := os.ReadFile("../../../../core/contracts/release-control-plane/fixtures/canonical.json")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}

	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		t.Fatalf("decode fixture: %v", err)
	}

	canonical, err := CanonicalJSON(value)
	if err != nil {
		t.Fatalf("canonical JSON: %v", err)
	}
	if actual, want := string(canonical), `{"a":{"x":1,"y":null},"unicode":"é","z":[3,{"a":"text","b":false}]}`; actual != want {
		t.Fatalf("canonical JSON = %q, want %q", actual, want)
	}

	digest, err := CanonicalSHA256(value)
	if err != nil {
		t.Fatalf("canonical digest: %v", err)
	}
	if want := "e528cc5e886a233f86c7db96ccca8370c717e0feeed26d895bc5e0efea57214b"; digest != want {
		t.Fatalf("canonical digest = %s, want %s", digest, want)
	}
}
