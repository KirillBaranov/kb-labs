package journey_test

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/kb-labs/create/v2/catalog"
	"github.com/kb-labs/create/v2/contracts"
	"github.com/kb-labs/create/v2/doctor"
	"github.com/kb-labs/create/v2/receipt"
	"github.com/kb-labs/create/v2/render"
	"github.com/kb-labs/create/v2/resolve"
	"github.com/kb-labs/create/v2/verify"
)

type status []string

func (s status) ServiceStatuses(string) ([]string, error) { return s, nil }
func TestOfflineJourneyUsesResolvedGraphAsSingleTruth(t *testing.T) {
	root := t.TempDir()
	source := catalog.Catalog{Channels: map[contracts.Channel]string{contracts.ChannelStable: "2.0.0"}, Platforms: []catalog.PlatformBundle{{ID: "platform", Version: "2.0.0", Package: "@kb/platform", SHA256: "platform", Profiles: map[string]contracts.ServiceGraph{"default": {Services: []contracts.Service{{ID: "gateway", Command: "kb-gateway", Port: 4000, Required: true}}}}, Requires: []catalog.Requirement{{Capability: "logging", RequiredBy: "platform"}}}}, Plugins: []catalog.Component{{ID: "review", Version: "1.0.0", Package: "@kb/review", SHA256: "review", PlatformRange: "^2.0.0"}}, Adapters: []catalog.Adapter{{Component: catalog.Component{ID: "pino", Version: "1.0.0", Package: "@kb/pino", SHA256: "pino", PlatformRange: "^2.0.0"}, Provides: []string{"logging"}}}}
	plan, err := resolve.Plan(contracts.InstallRequest{PlatformRoot: root, Source: contracts.SourceOffline, Plugins: []contracts.ComponentRequest{{ID: "review"}}}, source)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := render.Write(plan); err != nil {
		t.Fatal(err)
	}
	check, err := verify.Run(plan, status{"gateway"}, time.Unix(0, 0))
	if err != nil {
		t.Fatal(err)
	}
	r := contracts.InstallReceipt{Schema: contracts.ReceiptSchema, ID: "r1", Plan: plan, Verification: check}
	if err := receipt.Write(root, r); err != nil {
		t.Fatal(err)
	}
	loaded, err := receipt.Read(root)
	if err != nil || loaded.Plan.PlanHash != plan.PlanHash {
		t.Fatalf("receipt %#v, %v", loaded, err)
	}
	config, err := os.ReadFile(filepath.Join(root, ".kb", "kb.config.jsonc"))
	if err != nil {
		t.Fatal(err)
	}
	if len(config) == 0 {
		t.Fatal("empty config")
	}
	findings := doctor.Diagnose([]doctor.Manifest{{ID: "review", Requirements: []doctor.Requirement{{Path: "/review/token", Secret: true, Required: true, Hint: "Set REVIEW_TOKEN"}}}}, map[string]bool{})
	if len(findings) != 1 || findings[0].Code != contracts.CodeInputRequired || findings[0].SafeFix {
		t.Fatalf("unexpected doctor findings %#v", findings)
	}
}
