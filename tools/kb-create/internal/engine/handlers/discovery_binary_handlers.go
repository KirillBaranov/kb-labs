package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/kb-labs/create/internal/bindown"
	"github.com/kb-labs/create/internal/engine/config"
	"github.com/kb-labs/create/internal/engine/executor"
	"github.com/kb-labs/create/internal/engine/plan"
	"github.com/kb-labs/create/internal/platform"
	"github.com/kb-labs/create/internal/scan"
)

// discoveryHandler scans the packages actually installed under the platform
// dir for facts the catalog can't know ahead of time (a port, a capability —
// see plan.ActionDiscoverServices), writes devservices.yaml/marketplace.lock
// from that scan, and symlinks the kb CLI into the user's PATH (needs
// @kb-labs/cli-bin already installed, which discovery's DependsOn on the
// package actions already guarantees).
//
// Idempotent by construction: scan.WriteConfigs and platform.WriteCLIWrapper
// both overwrite/replace rather than accumulate, so Check always reports
// "not yet satisfied" and Apply always re-runs — cheap, and correctness
// doesn't depend on skipping it.
type discoveryHandler struct {
	platformDir string
	projectDir  string
	// gatewayPatches is shared with configHandler (same pointer, passed in at
	// Registry-construction time): discovery appends the gateway upstream
	// patches it derives from the scan here, and configHandler — which
	// discover:services's DependsOn guarantees runs after — reads them at
	// render time. This is the one runtime fact (a service's actual port,
	// read from the installed package's own manifest) that genuinely can't
	// be known at plan-compile time; see plan.GatewayRouteInfo's doc for why
	// the rest of the route (prefix/rewrite/websocket) *is* static.
	gatewayPatches *[]config.ConfigPatch
}

func (h *discoveryHandler) Check(_ context.Context, _ plan.PlanAction) (bool, error) {
	// Always re-run: cheap (a directory scan), and the whole point is to
	// reflect the current state of node_modules, which install/update can
	// change from run to run.
	return false, nil
}

func (h *discoveryHandler) Apply(_ context.Context, action plan.PlanAction) (executor.ActionResult, error) {
	if h.platformDir == "" {
		return executor.ActionResult{}, fmt.Errorf("discover-services: platform dir is not configured")
	}
	result, err := scan.Run(h.platformDir)
	if err != nil {
		return executor.ActionResult{}, fmt.Errorf("scan installed manifests: %w", err)
	}
	if err := scan.WriteConfigs(h.platformDir, result, h.projectDir); err != nil {
		return executor.ActionResult{}, fmt.Errorf("write discovered configs: %w", err)
	}
	symlinkCLI(h.platformDir)
	if h.gatewayPatches != nil {
		patches, err := gatewayUpstreamPatches(result, action.Inputs["gatewayRoutesJSON"])
		if err != nil {
			return executor.ActionResult{}, fmt.Errorf("derive gateway upstream plan: %w", err)
		}
		*h.gatewayPatches = append(*h.gatewayPatches, patches...)
	}
	return executor.ActionResult{}, nil
}

// gatewayUpstreamPatches derives the gateway upstream + service-transport
// patches from a scan result and the compile-time-resolved route info
// embedded in the discover:services action (see plan.gatewayRoutesJSON).
// Empty routesJSON (no selected service is gateway-routed) is not an error —
// it just means there's nothing to add.
func gatewayUpstreamPatches(result *scan.ScanResult, routesJSON string) ([]config.ConfigPatch, error) {
	if routesJSON == "" {
		return nil, nil
	}
	var routes map[string]plan.GatewayRouteInfo
	if err := json.Unmarshal([]byte(routesJSON), &routes); err != nil {
		return nil, fmt.Errorf("decode gateway routes: %w", err)
	}
	infoMap := make(map[string]scan.ServiceGatewayInfo, len(routes))
	for id, route := range routes {
		infoMap[id] = scan.ServiceGatewayInfo{Prefix: route.Prefix, Rewrite: route.Rewrite, WebSocket: route.WebSocket}
	}
	gwPlan := scan.GenerateGatewayConfig(result, infoMap)
	var patches []config.ConfigPatch
	for id, upstream := range gwPlan.Gateway.Upstreams {
		value, err := json.Marshal(upstream)
		if err != nil {
			return nil, err
		}
		patches = append(patches, config.ConfigPatch{
			ID: "gateway.upstream." + id, Scope: config.ScopePlatform, Operation: config.OperationSet,
			Path: "/gateway/upstreams/" + id, Value: value, Owner: "discover:services",
		})
	}
	for id, transport := range gwPlan.Transport {
		value, err := json.Marshal(transport)
		if err != nil {
			return nil, err
		}
		patches = append(patches, config.ConfigPatch{
			ID: "adapterOptions.serviceTransport.services." + id, Scope: config.ScopePlatform, Operation: config.OperationSet,
			Path: "/adapterOptions/serviceTransport/services/" + id, Value: value, Owner: "discover:services",
		})
	}
	return patches, nil
}

func (h *discoveryHandler) Verify(_ context.Context, _ plan.PlanAction, _ executor.ActionResult) error {
	// scan.WriteConfigs only writes devservices.yaml/marketplace.lock when
	// the scan actually found services/plugins/adapters — a platform with
	// none selected legitimately produces neither file (matches
	// scan.WriteConfigs's own documented behavior, unchanged by this
	// handler). Asserting their presence here would fail exactly the "no
	// services selected" case Apply already handled correctly, so there is
	// nothing more to verify beyond Apply not having errored.
	return nil
}

// symlinkCLI creates a platform-appropriate launcher for the KB CLI (Unix:
// shell script at ~/.local/bin/kb; Windows: batch file). Best-effort: a
// missing bin.js (package not selected/installed) or a PATH resolve failure
// are non-fatal — the install itself already succeeded, and doctor/status
// surface the missing symlink clearly enough for the user to fix by hand.
func symlinkCLI(platformDir string) {
	binJS := filepath.Join(platformDir, "node_modules", "@kb-labs", "cli-bin", "dist", "bin.js")
	if _, err := os.Stat(binJS); err != nil {
		return
	}
	binDir, err := platform.UserBinDir()
	if err != nil {
		return
	}
	if _, err := platform.WriteCLIWrapper(binDir, binJS); err != nil {
		return
	}
	platform.EnsureInPATH(binDir)
}

// binaryHandler downloads (or, in dev mode, copies) a Go binary distributed
// via GitHub Releases into the platform's bin/ dir and installs it into the
// user's PATH — the same two-step copy installer.go's pre-cutover
// installBinaries did, reusing the same internal/bindown and
// internal/platform primitives (neither depends on the legacy scaffold
// renderer). The binary's repo/name/version/localPath are resolved once at
// plan-compile time (plan.Compile) and travel in the action's Inputs, the
// same way ActionInstallPackage carries resolved package specs — the
// handler stays a pure function of the action, no separate catalog lookup.
type binaryHandler struct {
	platformDir string
}

func (h *binaryHandler) Check(_ context.Context, action plan.PlanAction) (bool, error) {
	userBinDir, err := platform.UserBinDir()
	if err != nil {
		return false, err
	}
	if info, statErr := os.Stat(filepath.Join(userBinDir, binaryName(action))); statErr == nil && !info.IsDir() {
		return true, nil
	}
	return false, nil
}

func (h *binaryHandler) Apply(_ context.Context, action plan.PlanAction) (executor.ActionResult, error) {
	if h.platformDir == "" {
		return executor.ActionResult{}, fmt.Errorf("install-binary %s: platform dir is not configured", action.Inputs["id"])
	}
	name := binaryName(action)
	binDir := filepath.Join(h.platformDir, "bin")
	userBinDir, err := platform.UserBinDir()
	if err != nil {
		return executor.ActionResult{}, fmt.Errorf("resolve user bin dir: %w", err)
	}

	if localPath := action.Inputs["localPath"]; localPath != "" {
		copyRes, copyErr := platform.CopyBinary(localPath, binDir, name)
		if copyErr != nil {
			return executor.ActionResult{}, fmt.Errorf("binary %s (local): %w", name, copyErr)
		}
		if _, err := platform.CopyBinary(copyRes.Path, userBinDir, name); err != nil {
			return executor.ActionResult{}, fmt.Errorf("install %s to user bin dir: %w", name, err)
		}
		return executor.ActionResult{}, nil
	}

	ch := make(chan bindown.Progress, 8)
	done := make(chan struct{})
	go func() {
		defer close(done)
		for range ch {
			// Progress is surfaced via the executor's own Event stream at the
			// action level; per-byte download progress isn't wired through
			// yet — draining here just keeps bindown from blocking on a full
			// channel.
		}
	}()
	var result *bindown.Result
	var dlErr error
	if version := action.Inputs["version"]; version != "" {
		result, dlErr = bindown.DownloadVersion(action.Inputs["repo"], name, version, binDir, ch)
	} else {
		result, dlErr = bindown.Download(action.Inputs["repo"], name, binDir, ch)
	}
	close(ch)
	<-done
	if dlErr != nil {
		return executor.ActionResult{}, fmt.Errorf("binary %s: %w", name, dlErr)
	}
	if _, err := platform.CopyBinary(result.Path, userBinDir, name); err != nil {
		return executor.ActionResult{}, fmt.Errorf("install %s to user bin dir: %w", name, err)
	}
	return executor.ActionResult{}, nil
}

func binaryName(action plan.PlanAction) string {
	if name := action.Inputs["name"]; name != "" {
		return name
	}
	return action.Inputs["id"]
}

func (h *binaryHandler) Verify(ctx context.Context, action plan.PlanAction, _ executor.ActionResult) error {
	ok, err := h.Check(ctx, action)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("binary %q was not installed to the user bin dir", action.Inputs["id"])
	}
	return nil
}
