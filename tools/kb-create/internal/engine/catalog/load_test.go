package catalog

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestLoadNormalizesAndComputesReproducibleDigest(t *testing.T) {
	first := []byte(`{"providers":[{"id":"redis","capability":"cache","features":["ttl","kv"],"package":"redis"}],"components":[{"id":"commit","kind":"plugin","package":"commit","dependsOn":["storage","core"]}]}`)
	second := []byte(`{"components":[{"package":"commit","kind":"plugin","dependsOn":["core","storage"],"id":"commit"}],"providers":[{"package":"redis","features":["kv","ttl"],"capability":"cache","id":"redis"}]}`)
	a, err := Load(first)
	if err != nil {
		t.Fatal(err)
	}
	b, err := Load(second)
	if err != nil {
		t.Fatal(err)
	}
	if a.Digest == "" || a.Digest != b.Digest {
		t.Fatalf("digests = %q / %q", a.Digest, b.Digest)
	}
	if a.Providers[0].Features[0] != "kv" || a.Components[0].DependsOn[0] != "core" {
		t.Fatalf("normalization = %#v", a)
	}
}

func TestLoadRejectsForgedDigestAndDuplicates(t *testing.T) {
	data := []byte(`{"digest":"forged","components":[{"id":"x","kind":"plugin","package":"x"}]}`)
	if _, err := Load(data); err == nil || !strings.Contains(err.Error(), "digest mismatch") {
		t.Fatalf("digest error = %v", err)
	}
	duplicate := Catalog{Components: []Component{{ID: "x", Kind: "plugin", Package: "x"}, {ID: "x", Kind: "plugin", Package: "y"}}}
	encoded, _ := json.Marshal(duplicate)
	if _, err := Load(encoded); err == nil || !strings.Contains(err.Error(), "duplicate component") {
		t.Fatalf("duplicate error = %v", err)
	}
}
