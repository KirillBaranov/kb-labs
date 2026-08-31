package transport

import (
	"testing"

	"github.com/kb-labs/create/v2/catalog"
	"github.com/kb-labs/create/v2/contracts"
)

func TestPlanUsesOnlyV2JSONRequestAndCatalog(t *testing.T) {
	source := catalog.Catalog{Platforms: []catalog.PlatformBundle{{ID: "platform", Version: "2.0.0", Package: "@kb/platform", SHA256: "sha", Profiles: map[string]contracts.ServiceGraph{"default": {}}}}}
	response := Plan([]byte(`{"schema":"kb.create/v2","platformRoot":"/tmp/platform","source":"offline"}`), source)
	if !response.OK || response.Plan == nil || response.Plan.Request.PlatformRoot != "/tmp/platform" {
		t.Fatalf("response = %#v", response)
	}
}
func TestPlanReturnsStructuredFailureForBadRequest(t *testing.T) {
	response := Plan([]byte(`not-json`), catalog.Catalog{})
	if response.OK || response.Error == nil || response.Error.Stage != contracts.StageResolve {
		t.Fatalf("response = %#v", response)
	}
}
