// Package scan discovers KB Labs entities (plugins, adapters, services)
// by invoking a Node.js script that scans node_modules for manifests.
//
// The scanner.js file is embedded into the Go binary at compile time
// and written to a temp file for execution.
package scan

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

//go:embed scanner.js
var scannerScript []byte

// ── Result types ────────────────────────────────────────────────────────────

// ScanResult is the parsed output from the Node.js scanner.
type ScanResult struct {
	Plugins  []PluginEntry  `json:"plugins"`
	Adapters []AdapterEntry `json:"adapters"`
	Services []ServiceEntry `json:"services"`
	Errors   []ScanError    `json:"errors"`
}

// PluginEntry describes a discovered plugin.
type PluginEntry struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Version      string   `json:"version"`
	Description  string   `json:"description"`
	ResolvedPath string   `json:"resolvedPath"`
	PrimaryKind  string   `json:"primaryKind"`
	Provides     []string `json:"provides"`
}

// AdapterEntry describes a discovered adapter.
type AdapterEntry struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Version      string `json:"version"`
	Description  string `json:"description"`
	ResolvedPath string `json:"resolvedPath"`
	Implements   string `json:"implements"`
	Type         string `json:"type"`
}

// ServiceEntry describes a discovered service.
type ServiceEntry struct {
	ID           string         `json:"id"`
	Name         string         `json:"name"`
	Version      string         `json:"version"`
	Description  string         `json:"description"`
	ResolvedPath string         `json:"resolvedPath"`
	Runtime      ServiceRuntime `json:"runtime"`
	DependsOn    []string       `json:"dependsOn"`
}

// ServiceRuntime describes how to start a service.
type ServiceRuntime struct {
	Entry       string `json:"entry"`
	Port        int    `json:"port"`
	HealthCheck string `json:"healthCheck"`
	Protocol    string `json:"protocol,omitempty"`
}

// ScanError describes a package that had a manifest field but failed to load.
type ScanError struct {
	Package string `json:"package"`
	Error   string `json:"error"`
}

// ── Public API ──────────────────────────────────────────────────────────────

// Run executes the Node.js scanner against platformDir and returns parsed results.
func Run(platformDir string) (*ScanResult, error) {
	// Write embedded script to temp file.
	tmp, err := os.CreateTemp("", "kb-scanner-*.mjs")
	if err != nil {
		return nil, fmt.Errorf("create temp scanner: %w", err)
	}
	defer func() {
		_ = tmp.Close()
		_ = os.Remove(tmp.Name()) // #nosec G703 -- best-effort cleanup of temp file
	}()

	if _, err := tmp.Write(scannerScript); err != nil {
		return nil, fmt.Errorf("write scanner: %w", err)
	}
	_ = tmp.Close()

	// Run: node <script> <platformDir>
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Pass "." as platformDir — cmd.Dir is already set to platformDir,
	// so the script resolves node_modules relative to cwd.
	// tmp.Name() is our own embedded scanner script, not user input.
	cmd := exec.CommandContext(ctx, "node", tmp.Name(), ".") //nolint:gosec
	cmd.Dir = platformDir

	out, err := cmd.Output()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			return nil, fmt.Errorf("scanner failed: %s", string(ee.Stderr))
		}
		return nil, fmt.Errorf("run scanner: %w", err)
	}

	var result ScanResult
	if err := json.Unmarshal(out, &result); err != nil {
		return nil, fmt.Errorf("parse scanner output: %w", err)
	}
	return &result, nil
}

// ── Config Generators ───────────────────────────────────────────────────────

// MarketplaceLock is the schema for .kb/marketplace.lock.
type MarketplaceLock struct {
	Schema    string                     `json:"schema"`
	Installed map[string]MarketplaceItem `json:"installed"`
}

// MarketplaceItem is a single entry in marketplace.lock.
type MarketplaceItem struct {
	Version      string   `json:"version"`
	Integrity    string   `json:"integrity"`
	ResolvedPath string   `json:"resolvedPath"`
	InstalledAt  string   `json:"installedAt"`
	Source       string   `json:"source"`
	PrimaryKind  string   `json:"primaryKind"`
	Provides     []string `json:"provides"`
	Enabled      bool     `json:"enabled"`
}

// GenerateMarketplaceLock creates a marketplace.lock from scan results.
func GenerateMarketplaceLock(r *ScanResult, platformDir string) *MarketplaceLock {
	now := time.Now().UTC().Format(time.RFC3339)
	lock := &MarketplaceLock{
		Schema:    "kb.marketplace/2",
		Installed: make(map[string]MarketplaceItem),
	}

	for _, p := range r.Plugins {
		integrity := computeIntegrity(platformDir, p.ResolvedPath)
		lock.Installed[p.ID] = MarketplaceItem{
			Version:      p.Version,
			Integrity:    integrity,
			ResolvedPath: p.ResolvedPath,
			InstalledAt:  now,
			Source:       "marketplace",
			PrimaryKind:  p.PrimaryKind,
			Provides:     p.Provides,
			Enabled:      true,
		}
	}

	for _, a := range r.Adapters {
		integrity := computeIntegrity(platformDir, a.ResolvedPath)
		lock.Installed[a.ID] = MarketplaceItem{
			Version:      a.Version,
			Integrity:    integrity,
			ResolvedPath: a.ResolvedPath,
			InstalledAt:  now,
			Source:       "marketplace",
			PrimaryKind:  "adapter",
			Provides:     []string{"adapter"},
			Enabled:      true,
		}
	}

	return lock
}

// devServiceYAML holds the data for a single service entry in devservices.yaml.
type devServiceYAML struct {
	id          string
	name        string
	description string
	group       string
	serviceType string
	command     string
	healthCheck string
	port        int
	url         string
	dependsOn   []string
}

// GenerateDevServicesYAML creates a devservices.yaml from scan results.
//
// DependsOn filtering: kb-dev rejects a config whose services reference
// unknown dependencies. We only include a dep if the target service was
// also found during scan — services that live in other installations
// (e.g. Docker containers like qdrant) are silently dropped.
// Services outside the installed set are by definition unavailable
// in this platform, so depending on them would be a guaranteed failure
// on `kb-dev start`.
func GenerateDevServicesYAML(r *ScanResult) string {
	// Pass 1: collect the set of service IDs that will land in the config.
	known := make(map[string]struct{}, len(r.Services))
	for _, s := range r.Services {
		known[s.ID] = struct{}{}
	}

	// Pass 2: build service entries.
	entries := make([]devServiceYAML, 0, len(r.Services))
	backendIDs := make([]string, 0, len(r.Services))
	for _, s := range r.Services {
		command := fmt.Sprintf("node %s/%s", s.ResolvedPath, s.Runtime.Entry)
		healthURL := ""
		if s.Runtime.HealthCheck != "" {
			proto := s.Runtime.Protocol
			if proto == "" {
				proto = "http"
			}
			healthURL = fmt.Sprintf("%s://localhost:%d%s", proto, s.Runtime.Port, s.Runtime.HealthCheck)
		}
		url := fmt.Sprintf("http://localhost:%d", s.Runtime.Port)
		filteredDeps := filterKnownDeps(s.DependsOn, known)

		entries = append(entries, devServiceYAML{
			id:          s.ID,
			name:        s.Name,
			description: s.Description,
			group:       "backend",
			serviceType: "node",
			command:     command,
			healthCheck: healthURL,
			port:        s.Runtime.Port,
			url:         url,
			dependsOn:   filteredDeps,
		})
		backendIDs = append(backendIDs, s.ID)
	}

	var b strings.Builder
	b.WriteString("name: KB Labs Platform\n\n")

	// groups section
	b.WriteString("groups:\n")
	b.WriteString("  backend: [")
	for i, id := range backendIDs {
		if i > 0 {
			b.WriteString(", ")
		}
		b.WriteString(id)
	}
	b.WriteString("]\n\nservices:\n")

	for _, svc := range entries {
		fmt.Fprintf(&b, "  %s:\n", svc.id)
		fmt.Fprintf(&b, "    name: %s\n", svc.name)
		if svc.description != "" {
			fmt.Fprintf(&b, "    description: %s\n", svc.description)
		}
		fmt.Fprintf(&b, "    group: %s\n", svc.group)
		fmt.Fprintf(&b, "    type: %s\n", svc.serviceType)
		fmt.Fprintf(&b, "    command: %s\n", svc.command)
		if svc.healthCheck != "" {
			fmt.Fprintf(&b, "    health_check: %s\n", svc.healthCheck)
		}
		if svc.port > 0 {
			fmt.Fprintf(&b, "    port: %d\n", svc.port)
		}
		if svc.url != "" {
			fmt.Fprintf(&b, "    url: %s\n", svc.url)
		}
		if len(svc.dependsOn) > 0 {
			b.WriteString("    depends_on: [")
			for i, dep := range svc.dependsOn {
				if i > 0 {
					b.WriteString(", ")
				}
				b.WriteString(dep)
			}
			b.WriteString("]\n")
		}
		b.WriteString("\n")
	}

	b.WriteString("settings:\n")
	b.WriteString("  logs_dir: .kb/logs/tmp\n")
	b.WriteString("  pid_dir: .kb/tmp\n")
	b.WriteString("  start_timeout_ms: 30000\n")
	b.WriteString("  health_check_interval_ms: 1000\n")

	return b.String()
}

// filterKnownDeps returns a new slice containing only those dependency IDs
// that are present in `known`. Returns nil (not an empty slice) when the
// filtered result is empty, so the generated JSON omits the field entirely
// via its `omitempty` tag.
func filterKnownDeps(deps []string, known map[string]struct{}) []string {
	if len(deps) == 0 {
		return nil
	}
	filtered := make([]string, 0, len(deps))
	for _, dep := range deps {
		if _, ok := known[dep]; ok {
			filtered = append(filtered, dep)
		}
	}
	if len(filtered) == 0 {
		return nil
	}
	return filtered
}

// WriteConfigs writes marketplace.lock and devservices.yaml to <platformDir>/.kb/.
func WriteConfigs(platformDir string, r *ScanResult) error {
	kbDir := filepath.Join(platformDir, ".kb")
	if err := os.MkdirAll(kbDir, 0o750); err != nil {
		return err
	}

	// marketplace.lock
	if len(r.Plugins)+len(r.Adapters) > 0 {
		lock := GenerateMarketplaceLock(r, platformDir)
		data, err := json.MarshalIndent(lock, "", "  ")
		if err != nil {
			return fmt.Errorf("marshal marketplace.lock: %w", err)
		}
		if err := os.WriteFile(filepath.Join(kbDir, "marketplace.lock"), data, 0o600); err != nil {
			return fmt.Errorf("write marketplace.lock: %w", err)
		}
	}

	// devservices.yaml
	if len(r.Services) > 0 {
		yaml := GenerateDevServicesYAML(r)
		if err := os.WriteFile(filepath.Join(kbDir, "devservices.yaml"), []byte(yaml), 0o600); err != nil {
			return fmt.Errorf("write devservices.yaml: %w", err)
		}
	}

	return nil
}

// ── Gateway config ─────────────────────────────────────────────────────────

// GatewayUpstream describes a single proxy target for the gateway.
type GatewayUpstream struct {
	URL           string  `json:"url"`
	Prefix        string  `json:"prefix"`
	RewritePrefix *string `json:"rewritePrefix,omitempty"` // nil=omitted (default), ""=strip prefix
}

// GatewayConfig is the gateway section written to .kb/kb.config.json.
type GatewayConfig struct {
	Port      int                        `json:"port"`
	Upstreams map[string]GatewayUpstream `json:"upstreams"`
}

// ServiceGatewayInfo holds gateway proxy config for a service from the manifest.
type ServiceGatewayInfo struct {
	Prefix  string
	Rewrite *string // nil = default (same as prefix), "" = strip prefix
}

// GenerateGatewayConfig builds gateway upstreams from scan results and
// manifest gateway info. Services without a prefix (gateway, studio) are skipped.
func GenerateGatewayConfig(r *ScanResult, infoMap map[string]ServiceGatewayInfo) *GatewayConfig {
	cfg := &GatewayConfig{
		Port:      4000,
		Upstreams: make(map[string]GatewayUpstream),
	}

	for _, svc := range r.Services {
		info, ok := infoMap[svc.ID]
		if !ok || info.Prefix == "" {
			continue
		}
		up := GatewayUpstream{
			URL:    fmt.Sprintf("http://localhost:%d", svc.Runtime.Port),
			Prefix: info.Prefix,
		}
		if info.Rewrite != nil {
			up.RewritePrefix = info.Rewrite
		}
		cfg.Upstreams[svc.ID] = up
	}

	// Add widgets proxy to REST if rest is present
	if rest, hasRest := cfg.Upstreams["rest"]; hasRest {
		cfg.Upstreams["widgets"] = GatewayUpstream{
			URL:    rest.URL,
			Prefix: "/api/v1/widgets",
		}
	}

	return cfg
}

// MergeGatewayIntoConfig reads the existing .kb/kb.config.json, sets the
// "gateway" key, and writes it back. Other keys are preserved.
func MergeGatewayIntoConfig(platformDir string, gw *GatewayConfig) error {
	configPath := filepath.Join(platformDir, ".kb", "kb.config.json")

	existing := make(map[string]any)
	// #nosec G304 -- path is deterministic
	data, err := os.ReadFile(configPath)
	if err == nil {
		_ = json.Unmarshal(data, &existing)
	}

	existing["gateway"] = gw

	out, err := json.MarshalIndent(existing, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config with gateway: %w", err)
	}
	return os.WriteFile(configPath, out, 0o600)
}

// ── helpers ─────────────────────────────────────────────────────────────────

// computeIntegrity returns the SRI hash of package.json for a given package.
func computeIntegrity(platformDir, resolvedPath string) string {
	pkgJSON := filepath.Join(platformDir, resolvedPath, "package.json")
	// #nosec G304 -- path is constructed from known platform dir + resolved path
	data, err := os.ReadFile(pkgJSON)
	if err != nil {
		return ""
	}
	h := sha256.Sum256(data)
	return "sha256-" + base64.StdEncoding.EncodeToString(h[:])
}
