package orchestrator

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/kb-labs/clikit/diag"
	"github.com/kb-labs/env/internal/config"
	"github.com/kb-labs/env/internal/env"
)

// DefaultPortBase: 0 = use the platform's default ports (no shift).
//
// Port isolation across environments / coexistence with a running dev server
// needs platform-level port unification: each daemon resolves its port
// independently (serviceTransport urls for some, hard-coded defaults for others
// like state-daemon 7777), so kb-dev --port-base shifts only kb-dev's view, not
// the service's actual bind. Until the platform reads one port source, the
// sandbox runs on default ports — one environment at a time, dev server stopped.
// See plan: "port isolation" follow-up.
const DefaultPortBase = 0

// UpResult is the machine-readable outcome of `up`.
type UpResult struct {
	Profile    string `json:"profile"`
	PortBase   int    `json:"portBase"`
	GatewayURL string `json:"gatewayUrl"`
	Platform   string `json:"platform"`
	Project    string `json:"project"`
}

// Up provisions and starts an environment from a profile, leaving it live.
// overlayPath, when non-empty, is applied after services come up (K3).
func Up(l env.Layout, profileName string, p config.Profile, overlayPath string, fresh bool) (UpResult, error) {
	ws, err := WorkspaceRoot()
	if err != nil {
		return UpResult{}, err
	}
	kbcreate, err := ResolveBinary("kb-create", ws)
	if err != nil {
		return UpResult{}, err
	}
	kbdev, err := ResolveBinary("kb-dev", ws)
	if err != nil {
		return UpResult{}, err
	}

	if fresh && l.Exists() {
		if err := l.Remove(); err != nil {
			return UpResult{}, fmt.Errorf("remove existing env: %w", err)
		}
	}
	if err := l.Ensure(); err != nil {
		return UpResult{}, err
	}

	portBase := DefaultPortBase
	if v := os.Getenv("KB_ENV_PORT_BASE"); v != "" {
		if n, perr := strconv.Atoi(v); perr == nil && n > 0 {
			portBase = n
		}
	}
	_ = portBase // shifting is opt-in via KB_ENV_PORT_BASE; default 0 = platform ports

	_ = l.WriteMeta(env.Meta{Profile: profileName, Mode: "verdaccio", PortBase: portBase, Status: "provisioning", CreatedAt: time.Now()})

	// 1. Verdaccio: bring up registry, publish all @kb-labs/* tarballs.
	registry, err := EnsureVerdaccio(l)
	if err != nil {
		return UpResult{}, err
	}
	if err := PackAll(ws); err != nil {
		return UpResult{}, err
	}
	if err := PublishAll(l, ws, registry); err != nil {
		return UpResult{}, err
	}

	// 2. Filtered manifest (subset, no localPath) → install from registry.
	manifest := filepath.Join(l.Logs, "manifest.json")
	if err := GenManifest(ws, p.Plugins, p.Services, true, manifest); err != nil {
		return UpResult{}, err
	}
	if err := Install(kbcreate, l, manifest, registry); err != nil {
		_ = l.WriteMeta(env.Meta{Profile: profileName, PortBase: portBase, Status: "broken"})
		return UpResult{}, err
	}

	// 3. Start services with the env's port base, then health-gate.
	cfgPath := l.DevservicesPath()
	if err := ensureConfigExists(cfgPath); err != nil {
		return UpResult{}, err
	}
	k := KBDev{Bin: kbdev, Config: cfgPath, PortBase: portBase, Layout: l}

	services := p.Services
	if _, _, err := k.Start(services); err != nil {
		return UpResult{}, fmt.Errorf("kb-dev start: %w", err)
	}
	readyRes, _, _ := k.Ready(services)
	if !readyRes.OK {
		_ = l.WriteMeta(env.Meta{Profile: profileName, PortBase: portBase, Status: "broken"})
		return UpResult{}, diag.New("ERR_HEALTH_TIMEOUT", "services did not become healthy",
			diag.WithReason(readyRes.failedServices()),
			diag.WithHint("logs: "+filepath.Join(l.Platform, ".kb", "logs")))
	}

	// 4. Apply config overlay (K3), if the profile declares one.
	if overlayPath != "" {
		if err := ApplyConfig(l, k, overlayPath, services); err != nil {
			return UpResult{}, err
		}
	}

	ports := ComputePorts(portBase)
	gwURL := fmt.Sprintf("http://127.0.0.1:%d", ports["gateway"])
	_ = l.WriteMeta(env.Meta{Profile: profileName, Mode: "verdaccio", PortBase: portBase, Ports: ports, Status: "running", CreatedAt: time.Now()})

	return UpResult{Profile: profileName, PortBase: portBase, GatewayURL: gwURL, Platform: l.Platform, Project: l.Project}, nil
}

// ComputePorts returns the service ports for a given base. base <= 0 means no
// shift (platform defaults). Otherwise it mirrors kb-dev config.ApplyPortBase:
// offset = base - minTCPPort, where minTCPPort is studio (3000).
func ComputePorts(base int) map[string]int {
	canonical := map[string]int{
		"studio":  3000,
		"gateway": 4000,
		"rest":    5050,
		"state":   7777,
	}
	if base <= 0 {
		return canonical
	}
	const minTCP = 3000
	offset := base - minTCP
	out := make(map[string]int, len(canonical))
	for id, p := range canonical {
		out[id] = p + offset
	}
	return out
}
