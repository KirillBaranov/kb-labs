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

	"github.com/kb-labs/create/internal/gateway"
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
//
// `Implements` is normalised to a slice even when the manifest declares a
// single contract — that lets one driver implement multiple contracts at
// once (e.g. `@kb-labs/adapters-sqlite` ships both `IDocumentDatabase` and
// `IKVStore`). The custom unmarshaller below accepts either shape on the
// wire.
type AdapterEntry struct {
	ID           string          `json:"id"`
	Name         string          `json:"name"`
	Version      string          `json:"version"`
	Description  string          `json:"description"`
	ResolvedPath string          `json:"resolvedPath"`
	Implements   ImplementsField `json:"implements"`
	Type         string          `json:"type"`
}

// ImplementsField holds the contracts an adapter satisfies. Accepts either
// a JSON string (`"ICache"`) or a JSON array (`["IDocumentDatabase", "IKVStore"]`)
// when decoding; always serialises back as an array.
type ImplementsField []string

// UnmarshalJSON accepts both string and []string forms.
func (i *ImplementsField) UnmarshalJSON(data []byte) error {
	// Try array first (the canonical / forward-looking shape).
	var arr []string
	if err := json.Unmarshal(data, &arr); err == nil {
		*i = arr
		return nil
	}
	// Fall back to single string (legacy single-contract manifests).
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return fmt.Errorf("implements: expected string or []string, got %s", string(data))
	}
	if s == "" {
		*i = nil
	} else {
		*i = []string{s}
	}
	return nil
}

// Has reports whether the adapter advertises the given contract.
func (i ImplementsField) Has(contract string) bool {
	for _, c := range i {
		if c == contract {
			return true
		}
	}
	return false
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
//
// When baseDir is non-empty, resolved paths are prefixed with it so the
// generated config can live in a project directory while referencing
// node_modules installed under a separate platform directory.
func GenerateDevServicesYAML(r *ScanResult, baseDir string) string {
	// Pass 1: collect the set of service IDs that will land in the config.
	known := make(map[string]struct{}, len(r.Services))
	for _, s := range r.Services {
		known[s.ID] = struct{}{}
	}

	// Pass 2: build service entries.
	entries := make([]devServiceYAML, 0, len(r.Services))
	backendIDs := make([]string, 0, len(r.Services))
	for _, s := range r.Services {
		resolvedPath := s.ResolvedPath
		if baseDir != "" {
			resolvedPath = filepath.Join(baseDir, s.ResolvedPath)
		}
		command := fmt.Sprintf("node %s/%s", resolvedPath, s.Runtime.Entry)
		healthURL := ""
		if s.Runtime.HealthCheck != "" {
			healthURL = normalizeHealthCheck(s.Runtime.HealthCheck, s.Runtime.Protocol, s.Runtime.Port)
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
	// Services may need longer than the default startup window while their
	// adapters initialize (notably rest-api with persistent stores). Keep the
	// generated config tolerant of that real startup path.
	b.WriteString("  start_timeout_ms: 120000\n")
	b.WriteString("  health_check_interval_ms: 1000\n")

	return b.String()
}

func normalizeHealthCheck(healthCheck, protocol string, port int) string {
	if strings.HasPrefix(healthCheck, "http://") || strings.HasPrefix(healthCheck, "https://") {
		return healthCheck
	}
	if strings.Contains(healthCheck, ":") && !strings.HasPrefix(healthCheck, "/") {
		return healthCheck
	}
	if protocol == "" {
		protocol = "http"
	}
	return fmt.Sprintf("%s://localhost:%d%s", protocol, port, healthCheck)
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
// When projectDir is non-empty and differs from platformDir, a second copy of
// devservices.yaml is written to <projectDir>/.kb/ with absolute command paths
// so that `kb-dev start` works from the project directory.
func WriteConfigs(platformDir string, r *ScanResult, projectDir string) error {
	kbDir := filepath.Join(platformDir, ".kb")
	if err := os.MkdirAll(kbDir, 0o750); err != nil {
		return err
	}

	// marketplace.lock — always in platformDir (shared across projects).
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

	// devservices.yaml — platform copy (relative paths, for running from platform dir).
	if len(r.Services) > 0 {
		yaml := GenerateDevServicesYAML(r, "")
		if err := os.WriteFile(filepath.Join(kbDir, "devservices.yaml"), []byte(yaml), 0o600); err != nil {
			return fmt.Errorf("write devservices.yaml: %w", err)
		}
	}

	// devservices.yaml — project copy (absolute paths, for running from project dir).
	absPlatform, _ := filepath.Abs(platformDir)
	absProject, _ := filepath.Abs(projectDir)
	if projectDir != "" && absProject != absPlatform && len(r.Services) > 0 {
		projKBDir := filepath.Join(projectDir, ".kb")
		if err := os.MkdirAll(projKBDir, 0o750); err != nil {
			return fmt.Errorf("create project .kb dir: %w", err)
		}
		yaml := GenerateDevServicesYAML(r, absPlatform)
		if err := os.WriteFile(filepath.Join(projKBDir, "devservices.yaml"), []byte(yaml), 0o600); err != nil {
			return fmt.Errorf("write project devservices.yaml: %w", err)
		}
	}

	return nil
}

// ── Gateway config ─────────────────────────────────────────────────────────

// ServiceGatewayInfo holds gateway proxy config for a service from the manifest.
type ServiceGatewayInfo struct {
	Prefix    string
	Rewrite   *string // nil = default (same as prefix), "" = strip prefix
	WebSocket bool
}

// GenerateGatewayConfig derives the gateway plan (upstreams + transport
// services) from scan results and manifest gateway info. Services without a
// prefix (gateway, studio) are skipped. The returned plan is rendered into the
// single platform config (kb.config.jsonc) by internal/scaffold — see
// gateway.Plan for where each part lands.
func GenerateGatewayConfig(r *ScanResult, infoMap map[string]ServiceGatewayInfo) *gateway.Plan {
	plan := &gateway.Plan{
		Gateway: gateway.Config{
			Port:      4000,
			Upstreams: make(map[string]gateway.Upstream),
		},
		Transport: make(map[string]gateway.TransportService),
	}

	for _, svc := range r.Services {
		info, ok := infoMap[svc.ID]
		if !ok || info.Prefix == "" {
			continue
		}
		// Transport: TCP loopback URL for @kb-labs/adapters-service-transport-http.
		plan.Transport[svc.ID] = gateway.TransportService{
			URL: fmt.Sprintf("http://127.0.0.1:%d", svc.Runtime.Port),
		}
		up := gateway.Upstream{
			ServiceID: svc.ID,
			Prefix:    info.Prefix,
			WebSocket: info.WebSocket,
		}
		if info.Rewrite != nil {
			up.RewritePrefix = info.Rewrite
		}
		plan.Gateway.Upstreams[svc.ID] = up
	}

	// Add widgets and plugin bundle proxies to REST if rest is present.
	// /plugins/* serves Module Federation remote entries (remoteEntry.js + chunks).
	if _, hasRest := plan.Gateway.Upstreams["rest"]; hasRest {
		plan.Gateway.Upstreams["widgets"] = gateway.Upstream{
			ServiceID: "rest",
			Prefix:    "/api/v1/widgets",
		}
		plan.Gateway.Upstreams["plugins"] = gateway.Upstream{
			ServiceID: "rest",
			Prefix:    "/plugins",
		}
	}

	return plan
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
