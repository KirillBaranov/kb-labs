package catalog

import (
	"testing"

	"github.com/kb-labs/create/v2/contracts"
)

func TestSealAndVerifyImmutableReleaseIndex(t *testing.T) {
	source, err := Seal(Catalog{Channels: map[contracts.Channel]string{contracts.ChannelStable: "2.0.0"}, Platforms: []PlatformBundle{{ID: "platform", Version: "2.0.0", Package: "@kb/platform", Tarball: "https://example.test/platform.tgz", SHA256: "artifact", Profiles: map[string]contracts.ServiceGraph{"default": {}}}}})
	if err != nil || source.Digest == "" || Verify(source) != nil {
		t.Fatalf("source/error = %#v / %v", source, err)
	}
	source.Platforms[0].Package = "@kb/tampered"
	if err := Verify(source); err == nil {
		t.Fatal("expected digest mismatch")
	}
}

func TestValidateRejectsChannelOutsideIndex(t *testing.T) {
	_, err := Seal(Catalog{Channels: map[contracts.Channel]string{contracts.ChannelStable: "missing"}, Platforms: []PlatformBundle{{ID: "platform", Version: "2.0.0", Package: "@kb/platform", Tarball: "https://example.test/platform.tgz", SHA256: "artifact", Profiles: map[string]contracts.ServiceGraph{"default": {}}}}})
	if err == nil {
		t.Fatal("expected absent channel target")
	}
}
