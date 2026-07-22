// Package scaffold generates and reads KB Labs config files for new and existing projects.
// The file uses JSONC (JSON with Comments) so users get inline documentation
// for every section — same pattern as tsconfig.json.
//
// Config placement follows ADR-0012 / ADR-0013:
//
//	platformDir/.kb/kb.config.jsonc  — full defaults, installer-owned (always overwritten)
//	projectDir/.kb/kb.config.jsonc   — platform.dir pointer, user-owned (skip if exists)
package scaffold

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/kb-labs/create/internal/gateway"
	"github.com/kb-labs/create/internal/manifest"
)

// GatewayCreds holds the KB Labs Gateway machine identity written into the
// project config during demo mode. The CLI uses clientId + clientSecret to
// refresh the short-lived LLM accessToken automatically.
type GatewayCreds struct {
	ClientID     string
	ClientSecret string
	GatewayURL   string
}

// DefaultGatewayURL is the production KB Labs cloud Gateway base URL used for
// demo-mode LLM credentials. Unrelated to internal/gateway, which models the
// platform's own API gateway config.
const DefaultGatewayURL = "https://api.kblabs.ru"

// DefaultAdapterRoles lists the capability roles generateFull always renders
// a package for, with or without an --adapters override (see the
// adapters-block renderer below). Exported so callers (e.g. cmd/install.go's
// reconciliation report) can know which roles are configured by default
// without duplicating this list. "cache" is deliberately absent — it has no
// built-in default and only appears when explicitly set via Options.Adapters.
var DefaultAdapterRoles = []string{
	"llm", "storage", "logger", "logRingBuffer", "analytics", "serviceTransport",
}

// Options controls which sections are included in the generated config.
type Options struct {
	PlatformDir         string
	Services            []string        // selected service IDs (e.g. "rest", "workflow")
	Plugins             []string        // selected plugin IDs  (e.g. "mind", "agents")
	DemoMode            bool            // generate demo workflow template
	GatewayCredentials  *GatewayCreds   // non-nil → write adapterOptions.llm (demo only)
	PreservedLLMOptions json.RawMessage // non-nil → write adapterOptions.llm verbatim (update preserve)
	// LLMProvider is the user's chosen LLM provider ("openai", "anthropic", or "").
	// When non-empty, LLMKey is written to .env as the provider-specific env var.
	LLMProvider string
	LLMKey      string // #nosec G117 -- written to .env with 0600 permissions
	// DocumentDatabase is the npm package that implements IDocumentDatabase
	// (e.g. "@kb-labs/adapters-sqlite"). When non-empty it is written into the
	// adapters section of the generated platform config so the gateway can
	// initialise features that require durable document storage (e.g. user auth).
	DocumentDatabase string
	// KVStore is the npm package that implements IKVStore
	// (e.g. "@kb-labs/adapters-sqlite/kv"). Written alongside DocumentDatabase.
	KVStore string
	// GatewayAuthEnabled controls the generated gateway.auth.enabled value.
	// nil → omit (production default: auth on). Solo local installs set it to
	// false so Studio opens without login (B-023).
	GatewayAuthEnabled *bool
	// GatewayHost controls the generated gateway.host value. "" → omit
	// (production default: 0.0.0.0). Solo local installs set "127.0.0.1" so a
	// no-auth Studio is never reachable off the machine.
	GatewayHost string
	// BootstrapAdminEmail / BootstrapTenantID / BootstrapAdminPassword control
	// the generated gateway.auth.bootstrap section + GATEWAY_BOOTSTRAP_ADMIN_PASSWORD
	// env var. Written only for non-local ("--yes"/server-mode) installs so the
	// gateway seeds a tenant-admin on first start and auto-provisions the CLI's
	// first credential to ~/.kb/credentials.json (#271: without this, a fresh
	// non-local install has no way to obtain any credential at all).
	// BootstrapAdminEmail == "" → omit the whole bootstrap section.
	BootstrapAdminEmail    string
	BootstrapTenantID      string
	BootstrapAdminPassword string // #nosec G117 -- written to .env with 0600 permissions
	// Gateway is the discovery-derived gateway plan (upstreams + transport).
	// nil → the canonical default plan is rendered (gateway.DefaultPlan), so an
	// install that ran no discovery still gets a working gateway section.
	Gateway *gateway.Plan
	// Projects is the registry of known local projects (alias → absolute path),
	// managed by `kb-dev register`/`kb-dev switch`. Preserved verbatim across
	// `kb-create update` — see ReadPlatformOptions and the "projects" section
	// in generateFull. Nil/empty is valid (no projects registered yet).
	Projects map[string]string
	// Adapters overrides which package backs a given capability role (e.g.
	// "cache" -> "@kb-labs/adapters-redis@0.2.0"), from `kb-create install
	// --adapters "role=pkg@version"`. Roles not present here keep their
	// existing hardcoded default (or, for roles with no default like "cache",
	// render nothing at all).
	Adapters map[string]string
	// Catalog is the manifest catalog the services/plugins toggle blocks are
	// rendered from. Nil renders both blocks empty — there is deliberately no
	// fallback to a hardcoded list here: that fallback is exactly the
	// catalog/template drift this field exists to remove (ADR-0026, I5).
	// Every real caller (cmd/create.go, cmd/update.go, cmd/install.go) already
	// has the loaded *manifest.Manifest in scope when building Options.
	Catalog *manifest.Manifest
}

// pluginInnerConfig holds the product-specific settings block rendered inside
// a plugin's generated config entry. Only these five plugins have their own
// settings today; any catalog plugin not listed here (including third-party
// additions) renders with an empty inner block — see writePluginBlock.
var pluginInnerConfig = map[string]string{
	"mind": `
      // Vector store for embeddings.
      // "local" = on-disk HNSW index, "qdrant" = external Qdrant server.
      "vectorStore": "local"`,
	"agents": `
      // Max steps per agent run (prevents infinite loops).
      "maxSteps": 25`,
	"ai-review": `
      // Review mode: "heuristic" (fast), "llm" (smart), "full" (both).
      "mode": "full"`,
	"commit": `
      // Auto-stage changed files before generating commit.
      "autoStage": false`,
	"scaffold": `
      // Output directory for scaffolded entities.
      "outDir": "plugins"`,
}

// servicesWithoutToggle lists catalog services deliberately excluded from the
// generic services-toggle loop. "gateway" already has its own dedicated,
// richer config section elsewhere in generateFull (auth/host/upstreams) — a
// second simple on/off toggle for it would be redundant and could conflict
// with that section (which one wins?).
var servicesWithoutToggle = map[string]bool{
	"gateway": true,
}

// WritePlatformConfig writes the full platform config to platformDir/.kb/kb.config.jsonc.
// This file is installer-owned and is always overwritten on install/update so that
// platform defaults (adapters, adapterOptions, execution) stay in sync with the manifest.
func WritePlatformConfig(platformDir string, opts Options) error {
	dir := filepath.Join(platformDir, ".kb")
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return fmt.Errorf("create .kb dir: %w", err)
	}
	content := generateFull(opts)
	path := filepath.Join(dir, "kb.config.jsonc")
	// #nosec G306 -- platform config is expected to be readable in the workspace.
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return err
	}
	// Best-effort: lets `kb-dev switch`/`register` find this platform when
	// invoked from outside any project directory. Not fatal on failure — the
	// per-project kb.config.jsonc "platform.dir" pointer still works.
	_ = RecordActivePlatform(platformDir)
	return nil
}

// WriteProjectConfig writes a minimal platform.dir pointer to projectDir/.kb/kb.config.jsonc
// (skipped if the file already exists — user-owned) and writes project-scoped artifacts:
// .env (gateway credentials), .gitignore entries, and example workflows.
//
// When platformDir == projectDir (single-directory install), WritePlatformConfig has already
// written the full config to that location, so the pointer write is naturally skipped.
func WriteProjectConfig(projectDir string, opts Options) error {
	dir := filepath.Join(projectDir, ".kb")
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return fmt.Errorf("create .kb dir: %w", err)
	}

	// Write pointer config only when neither kb.config.jsonc nor kb.config.json exists.
	// If either exists the user already has a project config — never overwrite either.
	// (kb.config.jsonc has priority in the loader; kb.config.json is the dev convention.)
	cfgJsonc := filepath.Join(dir, "kb.config.jsonc")
	cfgJson := filepath.Join(dir, "kb.config.json")
	_, jsoncErr := os.Stat(cfgJsonc)
	_, jsonErr := os.Stat(cfgJson)
	if os.IsNotExist(jsoncErr) && os.IsNotExist(jsonErr) {
		content := generatePointer(opts.PlatformDir)
		// #nosec G306 -- project config is expected to be readable in workspace.
		if err := os.WriteFile(cfgJsonc, []byte(content), 0o644); err != nil {
			return err
		}
	}

	// API keys / gateway secrets stay in projectDir (gitignored) — never in platformDir.
	if err := writeEnvFile(projectDir, opts.GatewayCredentials, opts.LLMProvider, opts.LLMKey, opts.BootstrapAdminPassword); err != nil {
		return fmt.Errorf("scaffold .env: %w", err)
	}

	if err := ensureGitignore(projectDir); err != nil {
		return fmt.Errorf("scaffold gitignore: %w", err)
	}

	if opts.DemoMode {
		if err := writeDemoWorkflow(dir); err != nil {
			return fmt.Errorf("scaffold demo workflow: %w", err)
		}
	}

	// Write starter workflows when workflow service is selected.
	// Written to project dir (user edits) and platform dir (daemon scans).
	if toSet(opts.Services)["workflow"] {
		if err := writeStarterWorkflows(dir); err != nil {
			return fmt.Errorf("scaffold starter workflows: %w", err)
		}
		if opts.PlatformDir != "" && filepath.Clean(opts.PlatformDir) != filepath.Clean(projectDir) {
			platformKbDir := filepath.Join(opts.PlatformDir, ".kb")
			if err := writeStarterWorkflows(platformKbDir); err != nil {
				return fmt.Errorf("scaffold platform workflows: %w", err)
			}
		}
	}

	return nil
}

// ReadPlatformOptions reads Services and Plugins selections from an existing
// platformDir/.kb/kb.config.jsonc. Used by `kb-create update` to preserve the
// user's original install choices when refreshing platform defaults.
// Returns a minimal Options on any error so the caller can still proceed.
//
// projectDir is optional: when provided, if the platform config has empty LLM
// options ("llm": {}) but projectDir/.env contains KB_GATEWAY_CLIENT_ID and
// KB_GATEWAY_CLIENT_SECRET, those credentials are recovered into GatewayCredentials
// so the next WritePlatformConfig re-wires them correctly.
func ReadPlatformOptions(platformDir string, projectDir ...string) Options {
	opts := Options{PlatformDir: platformDir}

	data, err := os.ReadFile(filepath.Join(platformDir, ".kb", "kb.config.jsonc"))
	if err != nil {
		return opts
	}

	// Strip JSONC comments before parsing. The generated platform config only
	// contains // line comments (no URLs), so simple line-comment removal is safe.
	cleaned := stripGeneratedJsonc(string(data))

	var cfg struct {
		Services map[string]bool `json:"services"`
		Plugins  map[string]struct {
			Enabled bool `json:"enabled"`
		} `json:"plugins"`
		AdapterOptions struct {
			LLM json.RawMessage `json:"llm"`
		} `json:"adapterOptions"`
		Platform struct {
			Adapters struct {
				DocumentDatabase string `json:"documentDatabase"`
				KVStore          string `json:"kvStore"`
			} `json:"adapters"`
		} `json:"platform"`
		Gateway struct {
			Host string `json:"host"`
			Auth *struct {
				Enabled   *bool `json:"enabled"`
				Bootstrap *struct {
					TenantID   string `json:"tenantId"`
					AdminEmail string `json:"adminEmail"`
				} `json:"bootstrap"`
			} `json:"auth"`
		} `json:"gateway"`
		Projects map[string]string `json:"projects"`
	}
	if err := json.Unmarshal([]byte(cleaned), &cfg); err != nil {
		return opts
	}

	// Preserve the projects registry verbatim — kb-create update must never
	// silently drop projects that `kb-dev register`/`switch` added between
	// installer runs.
	opts.Projects = cfg.Projects

	for name, on := range cfg.Services {
		if on {
			opts.Services = append(opts.Services, name)
		}
	}
	for name, plug := range cfg.Plugins {
		if plug.Enabled {
			opts.Plugins = append(opts.Plugins, name)
		}
	}
	// Preserve documentDatabase and kvStore so kb-create update does not
	// remove adapters that were set from the manifest's adapterConfig.
	opts.DocumentDatabase = cfg.Platform.Adapters.DocumentDatabase
	opts.KVStore = cfg.Platform.Adapters.KVStore
	// Preserve gateway host + auth.enabled so kb-create update does not flip a
	// solo no-auth install back to auth-on, nor a cloud install to no-auth (B-023).
	opts.GatewayHost = cfg.Gateway.Host
	if cfg.Gateway.Auth != nil && cfg.Gateway.Auth.Enabled != nil {
		opts.GatewayAuthEnabled = cfg.Gateway.Auth.Enabled
	}
	// Preserve the bootstrap admin identity (#271) so `kb-create update` never
	// regenerates it — that would desync the config from the admin account and
	// CLI credential already seeded by a previous gateway start.
	if cfg.Gateway.Auth != nil && cfg.Gateway.Auth.Bootstrap != nil {
		opts.BootstrapTenantID = cfg.Gateway.Auth.Bootstrap.TenantID
		opts.BootstrapAdminEmail = cfg.Gateway.Auth.Bootstrap.AdminEmail
		if len(projectDir) > 0 && projectDir[0] != "" {
			opts.BootstrapAdminPassword = readEnvValue(projectDir[0], "GATEWAY_BOOTSTRAP_ADMIN_PASSWORD")
		}
	}
	// Preserve existing LLM adapter options (e.g. gateway URL + credentials)
	// so that kb-create update does not reset --llm configuration.
	llmRaw := string(cfg.AdapterOptions.LLM)
	if len(cfg.AdapterOptions.LLM) > 0 && llmRaw != "{}" && llmRaw != "null" {
		opts.PreservedLLMOptions = cfg.AdapterOptions.LLM
	} else if len(projectDir) > 0 && projectDir[0] != "" {
		// Platform config has empty LLM options but the project may have gateway
		// credentials written to .env during a previous install. Recover them so
		// the next WritePlatformConfig re-wires the ${...} placeholders correctly
		// instead of silently falling back to "llm": {}.
		if gc := readEnvCredentials(projectDir[0]); gc != nil {
			opts.GatewayCredentials = gc
		}
	}
	return opts
}

// parseEnvFile reads projectDir/.env into a key→value map. Returns an empty
// map (never nil) if the file doesn't exist or can't be read.
func parseEnvFile(projectDir string) map[string]string {
	vals := make(map[string]string)
	envPath := filepath.Join(projectDir, ".env")
	data, err := os.ReadFile(envPath) // #nosec G304 -- path derived from install config
	if err != nil {
		return vals
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		eq := strings.IndexByte(line, '=')
		if eq < 0 {
			continue
		}
		key := strings.TrimSpace(line[:eq])
		val := strings.TrimSpace(line[eq+1:])
		vals[key] = val
	}
	return vals
}

// readEnvValue reads a single key from projectDir/.env. Returns "" if the
// file or key is missing.
func readEnvValue(projectDir, key string) string {
	return parseEnvFile(projectDir)[key]
}

// readEnvCredentials attempts to read KB_GATEWAY_CLIENT_ID and
// KB_GATEWAY_CLIENT_SECRET from projectDir/.env. Returns nil if either is missing.
func readEnvCredentials(projectDir string) *GatewayCreds {
	vals := parseEnvFile(projectDir)
	clientID := vals["KB_GATEWAY_CLIENT_ID"]
	clientSecret := vals["KB_GATEWAY_CLIENT_SECRET"]
	if clientID == "" || clientSecret == "" {
		return nil
	}
	return &GatewayCreds{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		GatewayURL:   DefaultGatewayURL,
	}
}

// stripGeneratedJsonc removes // line comments, /* */ block comments, and
// trailing commas from the JSONC configs we generate.
//
// Only lines whose first non-whitespace characters are "//" are treated as
// comments — this preserves "http://" and "https://" inside JSON string
// values. Block comments are still stripped globally (we never write URLs
// inside /* */ blocks).
func stripGeneratedJsonc(src string) string {
	// Block comments (/* ... */) — safe to strip globally; never contain URLs.
	src = regexp.MustCompile(`/\*[\s\S]*?\*/`).ReplaceAllString(src, "")
	// Pure-comment lines: optional whitespace then "//" until end of line.
	// Does NOT match "url": "http://localhost:5050" because that line starts
	// with a quote character, not "//".
	src = regexp.MustCompile(`(?m)^\s*//[^\n]*\n?`).ReplaceAllString(src, "")
	// Trailing commas before } or ]
	src = regexp.MustCompile(`,(\s*[}\]])`).ReplaceAllString(src, "$1")
	return src
}

// resolveGatewayPlan returns the gateway plan to render: the discovery-derived
// plan when present, otherwise the canonical default so installs that ran no
// discovery still get a working gateway section.
func resolveGatewayPlan(opts Options) *gateway.Plan {
	if opts.Gateway != nil {
		return opts.Gateway
	}
	return gateway.DefaultPlan()
}

// renderGatewayUpstreams renders the gateway.upstreams entries as JSON object
// members (6-space indent), keys sorted for deterministic output. Each upstream
// is JSON-encoded so omitempty (rewritePrefix, websocket) is handled correctly.
func renderGatewayUpstreams(plan *gateway.Plan) string {
	keys := make([]string, 0, len(plan.Gateway.Upstreams))
	for k := range plan.Gateway.Upstreams {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var b strings.Builder
	for i, k := range keys {
		raw, _ := json.Marshal(plan.Gateway.Upstreams[k])
		fmt.Fprintf(&b, "      %q: %s", k, raw)
		if i < len(keys)-1 {
			b.WriteString(",")
		}
		b.WriteString("\n")
	}
	return b.String()
}

// renderTransportServices renders adapterOptions.serviceTransport.services
// entries as JSON object members (8-space indent), keys sorted.
func renderTransportServices(plan *gateway.Plan) string {
	keys := make([]string, 0, len(plan.Transport))
	for k := range plan.Transport {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var b strings.Builder
	for i, k := range keys {
		raw, _ := json.Marshal(plan.Transport[k])
		fmt.Fprintf(&b, "        %q: %s", k, raw)
		if i < len(keys)-1 {
			b.WriteString(",")
		}
		b.WriteString("\n")
	}
	return b.String()
}

// generateFull produces the complete platform config written to platformDir.
// Contains all sections: adapters, adapterOptions, execution, services, plugins.
func generateFull(opts Options) string {
	svcSet := toSet(opts.Services)
	plugSet := toSet(opts.Plugins)
	plan := resolveGatewayPlan(opts)

	var b strings.Builder

	b.WriteString(`{
  // ─── KB Labs Platform Configuration ───────────────────────────────────
  //
  // This file is managed by kb-create. Do not edit by hand.
  // To override settings for your project, add them to:
  //   projectDir/.kb/kb.config.jsonc
  //
  // Docs:  https://docs.kblabs.ru/configuration
  // CLI:   kb config --help

`)

	// ── platform section ──────────────────────────────────────────────────
	b.WriteString(`  // ─── Platform ──────────────────────────────────────────────────────────
  // Connection to the platform installation (node_modules, adapters, etc.)
  "platform": {
    // Path to the platform installation directory.
    "dir": `)
	b.WriteString(quote(opts.PlatformDir))
	b.WriteString(`,

    // Adapter bindings — which packages handle storage, LLM, logging, etc.
    // Each key maps to an adapter interface; the value is the npm package
    // that implements it. You can swap adapters without changing app code.
    "adapters": {
`)
	adapterPkg := func(role, def string) string {
		if v, ok := opts.Adapters[role]; ok && v != "" {
			return v
		}
		return def
	}
	b.WriteString("      // LLM via KB Labs Gateway — 50 free requests included.\n")
	b.WriteString("      // Replace with @kb-labs/adapters-openai when you have your own API key.\n")
	fmt.Fprintf(&b, "      \"llm\": %s,\n\n", quote(adapterPkg("llm", "@kb-labs/adapters-kblabs-gateway")))
	b.WriteString("      // File storage backend.\n")
	fmt.Fprintf(&b, "      \"storage\": %s,\n\n", quote(adapterPkg("storage", "@kb-labs/adapters-fs")))
	b.WriteString("      // Structured logger.\n")
	fmt.Fprintf(&b, "      \"logger\": %s,\n\n", quote(adapterPkg("logger", "@kb-labs/adapters-pino")))
	b.WriteString("      // In-memory log ring buffer for recent log access.\n")
	fmt.Fprintf(&b, "      \"logRingBuffer\": %s,\n\n", quote(adapterPkg("logRingBuffer", "@kb-labs/adapters-log-ringbuffer")))
	b.WriteString("      // Analytics — JSONL file, no native dependencies.\n")
	fmt.Fprintf(&b, "      \"analytics\": %s", quote(adapterPkg("analytics", "@kb-labs/adapters-analytics-file")))
	if v := opts.Adapters["cache"]; v != "" {
		b.WriteString(",\n\n      // Cache backend — no built-in default, must be set explicitly\n")
		b.WriteString("      // (e.g. via `kb-create install --adapters \"cache=@kb-labs/adapters-redis@...\"`).\n")
		fmt.Fprintf(&b, "      \"cache\": %s", quote(v))
	}
	if opts.DocumentDatabase != "" {
		b.WriteString(",\n\n      // Persistent document store — required for user auth (ADR-0020)\n")
		b.WriteString("      // and other features that need durable storage.\n")
		fmt.Fprintf(&b, "      \"documentDatabase\": %s", quote(opts.DocumentDatabase))
	}
	if opts.KVStore != "" {
		b.WriteString(",\n\n      // Key-value store — used for sessions, rate limiting, etc.\n")
		fmt.Fprintf(&b, "      \"kvStore\": %s", quote(opts.KVStore))
	}
	b.WriteString(",\n\n")
	b.WriteString("      // Service-to-service transport — gateway uses this to proxy to internal services.\n")
	b.WriteString("      // Supports TCP (default) and unix domain sockets (kb-dev socket mode).\n")
	fmt.Fprintf(&b, "      \"serviceTransport\": %s\n", quote(adapterPkg("serviceTransport", "@kb-labs/adapters-service-transport-http")))
	b.WriteString(`    },

    // Plugin execution mode: "worker-pool" (isolated workers, stable) or
    // "in-process" (fast, shared memory — lower isolation).
    "execution": {
      "mode": "worker-pool"
    }
  },

`)

	// ── adapterOptions ────────────────────────────────────────────────────
	b.WriteString("  // ─── Adapter Options ────────────────────────────────────────────────────\n")
	b.WriteString("  \"adapterOptions\": {\n")
	if opts.PreservedLLMOptions != nil {
		b.WriteString("    // LLM adapter options — preserved from previous install.\n")
		fmt.Fprintf(&b, "    \"llm\": %s,\n", string(opts.PreservedLLMOptions))
	} else if gc := opts.GatewayCredentials; gc != nil {
		b.WriteString("    // KB Labs Gateway credentials — read from .env (auto-configured).\n")
		b.WriteString("    // Replace with apiKey when switching to your own LLM provider.\n")
		b.WriteString("    \"llm\": {\n")
		fmt.Fprintf(&b, "      \"gatewayURL\": %s,\n", quote(gc.GatewayURL))
		b.WriteString("      \"kbClientId\": \"${KB_GATEWAY_CLIENT_ID}\",\n")
		b.WriteString("      \"kbClientSecret\": \"${KB_GATEWAY_CLIENT_SECRET}\"\n")
		b.WriteString("    },\n")
	} else {
		b.WriteString("    // LLM credentials — set your API key here or via KB_LABS_API_KEY env var.\n")
		b.WriteString("    // Docs: https://docs.kblabs.ru/adapters/built-in\n")
		b.WriteString("    \"llm\": {},\n")
	}
	b.WriteString("    \"storage\": { \"baseDir\": \".kb/storage\" },\n")
	b.WriteString("    \"logger\": { \"level\": \"info\" },\n")
	b.WriteString("    \"logRingBuffer\": { \"maxSize\": 100 },\n")
	// Analytics is always followed by serviceTransport, so always use trailing comma.
	b.WriteString("    \"analytics\": { \"filename\": \".kb/analytics/events.jsonl\" },\n")
	if opts.DocumentDatabase != "" {
		b.WriteString("    // Persistent document store options — filename is relative to the platform dir.\n")
		b.WriteString("    // Both documentDatabase and kvStore share the same file (single WAL connection).\n")
		b.WriteString("    \"documentDatabase\": { \"filename\": \".kb/data/platform.db\" },\n")
		if opts.KVStore != "" {
			b.WriteString("    \"kvStore\": { \"filename\": \".kb/data/platform.db\" },\n")
		}
	}
	b.WriteString("    // Service-to-service transport. urls = TCP loopback (ADR-0020).\n")
	b.WriteString("    // To use unix sockets, add \"socketPath\" per service (kb-dev injects KB_SOCKET_PATH).\n")
	b.WriteString("    \"serviceTransport\": {\n")
	b.WriteString("      \"services\": {\n")
	b.WriteString(renderTransportServices(plan))
	b.WriteString("      }\n")
	b.WriteString("    }\n")
	b.WriteString("  },\n\n")

	// ── gateway section ───────────────────────────────────────────────────
	b.WriteString(`  // ─── Gateway ──────────────────────────────────────────────────────────
  // API gateway upstream routing. upstreams reference serviceIds from
  // adapterOptions.serviceTransport.services above.
  // /ready checks that the "rest" upstream is up — keep this section present.
  "gateway": {
`)
	if opts.GatewayHost != "" {
		b.WriteString("    // Bind host. 127.0.0.1 = local only (solo). 0.0.0.0 = network (deploy).\n")
		fmt.Fprintf(&b, "    \"host\": %s,\n", quote(opts.GatewayHost))
	}
	if opts.GatewayAuthEnabled != nil {
		if *opts.GatewayAuthEnabled {
			if opts.BootstrapAdminEmail != "" {
				b.WriteString("    // Bootstrap admin + CLI credential (#271): seeded on first gateway start so\n")
				b.WriteString("    // `kb` commands work without a manual `kb auth login`. Admin password lives\n")
				b.WriteString("    // in .env (GATEWAY_BOOTSTRAP_ADMIN_PASSWORD), never in this file.\n")
				b.WriteString("    \"auth\": {\n")
				b.WriteString("      \"enabled\": true,\n")
				b.WriteString("      \"bootstrap\": {\n")
				fmt.Fprintf(&b, "        \"tenantId\": %s,\n", quote(opts.BootstrapTenantID))
				fmt.Fprintf(&b, "        \"adminEmail\": %s,\n", quote(opts.BootstrapAdminEmail))
				b.WriteString("        \"provisionCliCredentials\": true\n")
				b.WriteString("      }\n")
				b.WriteString("    },\n")
			} else {
				b.WriteString("    \"auth\": { \"enabled\": true },\n")
			}
		} else {
			b.WriteString("    // Auth disabled for local solo use — Studio opens without login.\n")
			b.WriteString("    // Guardrail: the gateway refuses to start with auth off on a non-loopback host.\n")
			b.WriteString("    \"auth\": { \"enabled\": false },\n")
		}
	}
	b.WriteString("    \"upstreams\": {\n")
	b.WriteString(renderGatewayUpstreams(plan))
	b.WriteString("    }\n")
	b.WriteString("  },\n\n")

	// ── services section ──────────────────────────────────────────────────
	b.WriteString(`  // ─── Services ─────────────────────────────────────────────────────────
  // Background daemons. Enable/disable based on what you installed.
  "services": {
`)
	if opts.Catalog != nil {
		for _, svc := range opts.Catalog.Services {
			if servicesWithoutToggle[svc.ID] {
				continue
			}
			writeToggle(&b, svc.ID, svc.Description, svcSet)
		}
	}
	b.WriteString(`  },

`)

	// ── plugins section ───────────────────────────────────────────────────
	b.WriteString(`  // ─── Plugins ──────────────────────────────────────────────────────────
  // Optional functionality. Each plugin can have its own nested config.
  "plugins": {
`)
	if opts.Catalog != nil {
		for _, plug := range opts.Catalog.Plugins {
			writePluginBlock(&b, plug.ID, plug.Description, plugSet, pluginInnerConfig[plug.ID])
		}
	}
	b.WriteString(`  },

`)

	// ── projects section ──────────────────────────────────────────────────
	b.WriteString(renderProjectsSection(opts.Projects))

	return b.String()
}

// renderProjectsSection renders the "projects" registry (alias → absolute
// path) as the final top-level key, closing the object.
//
// The entries live between two sentinel comment lines
// (kb-dev:projects:start/end) that `kb-dev register`/`unregister` locate via
// plain string search and splice in place — this lets kb-dev add or remove a
// single alias without re-parsing or re-generating the rest of this
// hand-templated file (which would blow away user-facing comments).
// Keep the sentinel lines and indentation stable; kb-dev's writer depends on
// their exact text.
func renderProjectsSection(projects map[string]string) string {
	keys := make([]string, 0, len(projects))
	for k := range projects {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var b strings.Builder
	b.WriteString(`  // ─── Projects ─────────────────────────────────────────────────────────
  // Registry of known local projects (alias -> absolute path), so you can run
  // "kb-dev switch <alias>" from anywhere without cd-ing into the project.
  // Managed by ` + "`kb-dev register`" + `/` + "`kb-dev switch`" + `. Safe to edit by hand too.
  "projects": {
    // kb-dev:projects:start
`)
	for i, k := range keys {
		comma := ","
		if i == len(keys)-1 {
			comma = ""
		}
		keyJSON, _ := json.Marshal(k)
		valJSON, _ := json.Marshal(projects[k])
		fmt.Fprintf(&b, "    %s: %s%s\n", keyJSON, valJSON, comma)
	}
	b.WriteString(`    // kb-dev:projects:end
  }
}
`)
	return b.String()
}

// generatePointer produces the minimal project-level config that points at platformDir.
// Users add overrides here; platform-only fields (adapters, adapterOptions, execution)
// are silently ignored by the config loader per ADR-0012 field policy.
func generatePointer(platformDir string) string {
	var b strings.Builder

	b.WriteString(`{
  // ─── KB Labs Project Configuration ────────────────────────────────────
  //
  // Platform defaults (adapters, execution, etc.) are inherited from the
  // platform installation directory. Add project-level overrides below.
  //
  // Docs: https://docs.kblabs.ru/configuration

  "platform": {
    // Set by kb-create — do not remove.
    "dir": `)
	b.WriteString(quote(platformDir))
	b.WriteString(`
  }

  // ─── Overrides (uncomment to customize) ───────────────────────────────
  // Mergeable fields: services, plugins. Deep-merged with platform defaults.
  // Platform-only fields (adapters, adapterOptions, execution) are ignored here.

  // "services": {
  //   "studio": true
  // },

  // "plugins": {
  //   "agents": { "enabled": true, "maxSteps": 50 }
  // }
}
`)

	return b.String()
}

// writeToggle writes an enabled/disabled entry with a comment.
func writeToggle(b *strings.Builder, id, comment string, enabled map[string]bool) {
	val := "false"
	if enabled[id] {
		val = "true"
	}
	fmt.Fprintf(b, "    // %s\n    %s: %s,\n", comment, quote(id), val)
}

// writePluginBlock writes a plugin config object with a comment and optional
// inner settings. Disabled plugins are written commented-out style (enabled: false).
// inner may be empty for plugins with no product-specific settings yet — the
// trailing comma is omitted in that case so the object stays valid JSON.
func writePluginBlock(b *strings.Builder, id, comment string, enabled map[string]bool, inner string) {
	on := enabled[id]
	fmt.Fprintf(b, "    // %s\n", comment)
	fmt.Fprintf(b, "    %s: {\n", quote(id))
	if inner == "" {
		fmt.Fprintf(b, "      \"enabled\": %t\n", on)
	} else {
		if on {
			fmt.Fprintf(b, "      \"enabled\": true,")
		} else {
			fmt.Fprintf(b, "      \"enabled\": false,")
		}
		b.WriteString(inner)
		b.WriteString("\n")
	}
	b.WriteString("    },\n")
}

// writeStarterWorkflows generates example workflows that showcase the engine.
// Written when the workflow service is selected (not just --demo).
func writeStarterWorkflows(kbDir string) error {
	wfDir := filepath.Join(kbDir, "workflows")
	if err := os.MkdirAll(wfDir, 0o750); err != nil {
		return fmt.Errorf("create workflows dir: %w", err)
	}

	workflows := map[string]string{
		"healthcheck.yaml": `# Healthcheck — verify your project builds and passes tests.
# Run:  kb workflow run --workflow-id healthcheck
# Docs: https://docs.kblabs.ru/workflows
name: healthcheck
version: 1.0.0
description: "Build, lint, and test your project"
on:
  manual: true

jobs:
  check:
    runsOn: local
    steps:
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Build
        run: pnpm build
      - name: Lint
        run: pnpm lint
        continueOnError: true
      - name: Test
        run: pnpm test
`,
		"deploy-with-approval.yaml": `# Deploy with approval gate — human sign-off before deploy.
# Run:  kb workflow run --workflow-id deploy-with-approval
# Docs: https://docs.kblabs.ru/workflows
name: deploy-with-approval
version: 1.0.0
description: "Build, test, get approval, then deploy"
on:
  manual: true

inputs:
  environment:
    type: string
    description: "Target environment"
    default: "staging"

jobs:
  build-and-test:
    runsOn: local
    steps:
      - name: Build
        run: pnpm build
      - name: Test
        run: pnpm test

  approve:
    needs: [build-and-test]
    runsOn: local
    steps:
      - name: Request approval
        uses: builtin:approval
        with:
          message: "Deploy to ${{ inputs.environment }}? Build and tests passed."
          approvers: ["team-lead"]
          timeout: "1h"

  deploy:
    needs: [approve]
    runsOn: local
    steps:
      - name: Deploy
        run: echo "Deploying to ${{ inputs.environment }}..."
        summary: "Deployed to ${{ inputs.environment }}"
`,
		"scheduled-report.yaml": `# Scheduled report — runs on a cron schedule.
# This workflow runs daily and generates a project health summary.
# Docs: https://docs.kblabs.ru/workflows
name: scheduled-report
version: 1.0.0
description: "Daily project health check (cron)"
on:
  schedule: "0 9 * * 1-5"
  manual: true

jobs:
  report:
    runsOn: local
    steps:
      - name: Git summary
        id: git
        run: |
          echo "## Commits (last 24h)"
          git log --oneline --since="24 hours ago" || echo "No recent commits"
      - name: Dependency check
        run: pnpm outdated || true
        continueOnError: true
      - name: Disk usage
        run: du -sh node_modules/ dist/ 2>/dev/null || echo "N/A"
`,
	}

	for name, content := range workflows {
		path := filepath.Join(wfDir, name)
		// Don't overwrite existing workflows (user may have edited them).
		if _, err := os.Stat(path); err == nil {
			continue
		}
		// #nosec G306 -- workflow config is expected to be readable in workspace.
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			return fmt.Errorf("write %s: %w", name, err)
		}
	}
	return nil
}

// writeEnvFile writes LLM/gateway credentials to .env in the project root.
// This file is gitignored by ensureGitignore, keeping secrets out of version control.
func writeEnvFile(projectDir string, gc *GatewayCreds, llmProvider, llmKey, bootstrapAdminPassword string) error {
	// Nothing to write if no credentials provided.
	if gc == nil && llmKey == "" && bootstrapAdminPassword == "" {
		return nil
	}

	path := filepath.Join(projectDir, ".env")

	existing, err := os.ReadFile(path) // #nosec G304 -- path derived from install config
	if err != nil && !os.IsNotExist(err) {
		return err
	}

	// Append to existing .env if present.
	f, ferr := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600) // #nosec G304
	if ferr != nil {
		return ferr
	}
	defer f.Close()

	var buf strings.Builder
	if gc != nil {
		buf.WriteString("\n# KB Labs Gateway credentials (auto-configured by kb-create)\n")
		buf.WriteString("KB_GATEWAY_CLIENT_ID=" + gc.ClientID + "\n")
		buf.WriteString("KB_GATEWAY_CLIENT_SECRET=" + gc.ClientSecret + "\n")
	}
	if llmKey != "" {
		var envVar string
		switch llmProvider {
		case "anthropic":
			envVar = "ANTHROPIC_API_KEY"
		default: // openai and anything else
			envVar = "OPENAI_API_KEY"
		}
		buf.WriteString("\n# LLM API key (configured by kb-create)\n")
		buf.WriteString(envVar + "=" + llmKey + "\n")
	}
	// Bootstrap admin password (#271) — only written once. `kb-create update`
	// passes the same value back in (recovered via ReadPlatformOptions), so
	// without this guard every re-run would append a duplicate line.
	if bootstrapAdminPassword != "" && !strings.Contains(string(existing), "GATEWAY_BOOTSTRAP_ADMIN_PASSWORD=") {
		buf.WriteString("\n# Gateway bootstrap admin password (#271, auto-configured by kb-create)\n")
		buf.WriteString("GATEWAY_BOOTSTRAP_ADMIN_PASSWORD=" + bootstrapAdminPassword + "\n")
	}
	_, err = f.WriteString(buf.String())
	return err
}

// ensureGitignore appends KB Labs ignore rules to .gitignore if not already present.
// Uses sentinel markers so re-runs are idempotent and existing user content is preserved.
func ensureGitignore(projectDir string) error {
	const (
		marker = "# kb-labs-ignore"
		block  = "\n# kb-labs-ignore\n.env\n.kb/analytics/\n.kb/cache/\n.kb/ai-review/\n.kb/storage/\n.kb/tmp/\n.kb/logs/\n.kb/commit/\n.kb/mind/\n.kb/database/\n# installer-managed — use .kb/devservices.dev.yaml for local dev\n.kb/devservices.yaml\n# installer-managed — use .kb/kb.config.json for local dev\n.kb/kb.config.jsonc\n# managed by kb-create update — the commit plugin refuses to commit these anyway\n.claude/\n# end-kb-labs-ignore\n"
	)
	path := filepath.Join(projectDir, ".gitignore")
	existing, err := os.ReadFile(path)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	if strings.Contains(string(existing), marker) {
		return nil // already present
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644) // #nosec G306
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.WriteString(block)
	return err
}

// writeDemoWorkflow generates .kb/workflows/demo.yaml inside the project .kb dir.
func writeDemoWorkflow(kbDir string) error {
	wfDir := filepath.Join(kbDir, "workflows")
	if err := os.MkdirAll(wfDir, 0o750); err != nil {
		return fmt.Errorf("create workflows dir: %w", err)
	}

	content := `# Demo pipeline — generated by kb-create --demo
# Run:  kb workflow run --workflow-id demo
# Edit: edit this file directly, then re-run
# Docs: https://docs.kblabs.ru/workflows

name: demo
description: "Quick demo — commit policy, AI review, QA gate"

steps:
  - plugin: commit-policy
    name: Commit Policy
    description: "Validate commit messages against conventional commits"
    config:
      # Number of recent commits to analyze.
      lastCommits: 5

  - plugin: ai-review
    name: AI Review
    description: "AI-powered code review of recent changes"
    config:
      # Review mode: "heuristic" (ESLint only), "llm" (AI only), "full" (both).
      mode: "llm"

  - plugin: qa-gate
    name: QA Gate
    description: "Run build, test, and lint checks"
    config:
      # Commands are auto-detected from your project.
      # Override here if needed:
      # build: "pnpm build"
      # test: "pnpm test"
      # lint: "pnpm lint"
`

	path := filepath.Join(wfDir, "demo.yaml")
	// #nosec G306 -- workflow config is expected to be readable in workspace.
	return os.WriteFile(path, []byte(content), 0o644)
}

func quote(s string) string {
	return `"` + s + `"`
}

func toSet(ids []string) map[string]bool {
	m := make(map[string]bool, len(ids))
	for _, id := range ids {
		m[id] = true
	}
	return m
}
