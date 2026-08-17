package wizard

import (
	"bytes"
	"testing"

	"github.com/kb-labs/create/v2/catalog"
	"github.com/kb-labs/create/v2/contracts"
)

func TestRequestBuildsSharedCompatibleRequest(t *testing.T) {
	source, err := catalog.Seal(catalog.Catalog{Channels: map[contracts.Channel]string{contracts.ChannelStable: "2.0.0"}, Platforms: []catalog.PlatformBundle{{ID: "platform", Version: "2.0.0", Package: "@kb/platform", Tarball: "https://example.test/platform.tgz", SHA256: "platform", Profiles: map[string]contracts.ServiceGraph{"default": {}}}}, Plugins: []catalog.Component{{ID: "review", Version: "1", Package: "@kb/review", Tarball: "https://example.test/review.tgz", SHA256: "review"}}, Adapters: []catalog.Adapter{{Component: catalog.Component{ID: "pino", Version: "1", Package: "@kb/pino", Tarball: "https://example.test/pino.tgz", SHA256: "pino"}}}})
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	request, err := Request(source, "/platform", IO{In: bytes.NewBufferString("\n\nreview\npino\n"), Out: &output})
	if err != nil {
		t.Fatal(err)
	}
	if request.Policy != contracts.PolicyCompatible || request.Platform.Channel != contracts.ChannelStable || len(request.Plugins) != 1 || request.Plugins[0].ID != "review" || len(request.Adapters) != 1 {
		t.Fatalf("request = %#v", request)
	}
}

func TestRequestRejectsUnknownInteractiveChoice(t *testing.T) {
	source, _ := catalog.Seal(catalog.Catalog{Channels: map[contracts.Channel]string{contracts.ChannelStable: "2.0.0"}, Platforms: []catalog.PlatformBundle{{ID: "platform", Version: "2.0.0", Package: "@kb/platform", Tarball: "https://example.test/platform.tgz", SHA256: "platform", Profiles: map[string]contracts.ServiceGraph{"default": {}}}}})
	if _, err := Request(source, "/platform", IO{In: bytes.NewBufferString("broken\n"), Out: &bytes.Buffer{}}); err == nil {
		t.Fatal("expected invalid choice")
	}
}
