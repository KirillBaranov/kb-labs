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
	"github.com/kb-labs/create/v2/runtime"
	"github.com/kb-labs/create/v2/verify"
)

type status []verify.ObservedService

func (s status) ServiceStatuses(string) ([]verify.ObservedService, error) { return s, nil }

type offlineArtifacts struct {
	installed, removed []contracts.Artifact
	restores           int
}

func (a *offlineArtifacts) Install(items []contracts.Artifact) error {
	a.installed = append(a.installed, items...)
	return nil
}
func (a *offlineArtifacts) Restore() error { a.restores++; return nil }
func (a *offlineArtifacts) Uninstall(items []contracts.Artifact) error {
	a.removed = append(a.removed, items...)
	return nil
}

type lifecycleServices struct{ status }

func (services *lifecycleServices) Ensure(_ string, _ []string) error { return nil }
func (services *lifecycleServices) Stop(_ string, _ []string) error {
	services.status = nil
	return nil
}

type journeyClock struct{ time.Time }

func (c journeyClock) Now() time.Time { return c.Time }
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
	check, err := verify.Run(plan, status{{ID: "gateway", State: "alive"}}, time.Unix(0, 0))
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

func TestOfflineLifecycleUsesReceiptSnapshotsForUpdateRollbackAndUninstall(t *testing.T) {
	root := t.TempDir()
	plan := contracts.ResolvedInstallPlan{Schema: contracts.ResolvedPlanSchema, PlanHash: "first-plan", Request: contracts.InstallRequest{PlatformRoot: root}, Artifacts: []contracts.Artifact{{ID: "platform", Package: "@kb/platform", Version: "1.0.0"}}, ServiceGraph: contracts.ServiceGraph{Services: []contracts.Service{{ID: "gateway", Command: "gateway", Required: true}}}}
	artifacts := &offlineArtifacts{}
	managed := &lifecycleServices{status: status{{ID: "gateway", State: "alive"}}}
	deps := runtime.Dependencies{Artifacts: artifacts, Status: managed, Activator: managed, Deactivator: managed, Clock: journeyClock{time.Unix(10, 0)}}
	first, err := runtime.Apply(plan, deps)
	if err != nil {
		t.Fatal(err)
	}
	updated := plan
	updated.PlanHash, updated.Artifacts[0].Version = "second-plan", "1.1.0"
	deps.Clock = journeyClock{time.Unix(11, 0)}
	second, snapshot, err := runtime.Update(updated, deps)
	if err != nil || second.SnapshotID != snapshot.ID {
		t.Fatalf("update = %#v / %#v / %v", second, snapshot, err)
	}
	if _, err := receipt.RestoreSnapshot(root, snapshot.ID); err != nil {
		t.Fatal(err)
	}
	restored, err := receipt.Read(root)
	if err != nil || restored.ID != first.ID {
		t.Fatalf("restored = %#v / %v", restored, err)
	}
	if _, err := runtime.Uninstall(root, deps); err != nil {
		t.Fatal(err)
	}
	if len(artifacts.removed) != 1 || artifacts.removed[0].Version != "1.0.0" {
		t.Fatalf("removed = %#v", artifacts.removed)
	}
}
