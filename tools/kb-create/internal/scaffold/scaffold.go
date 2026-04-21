// Package scaffold generates and reads KB Labs config files for new and existing projects.
// The file uses JSONC (JSON with Comments) so users get inline documentation
// for every section — same pattern as tsconfig.json.
//
// Config placement follows ADR-0012 / ADR-0013:
//   platformDir/.kb/kb.config.jsonc  — full defaults, installer-owned (always overwritten)
//   projectDir/.kb/kb.config.jsonc   — platform.dir pointer, user-owned (skip if exists)
package scaffold

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// GatewayCreds holds the KB Labs Gateway machine identity written into the
// project config during demo mode. The CLI uses clientId + clientSecret to
// refresh the short-lived LLM accessToken automatically.
type GatewayCreds struct {
	ClientID     string
	ClientSecret string
	GatewayURL   string
}

// Options controls which sections are included in the generated config.
type Options struct {
	PlatformDir        string
	Services           []string      // selected service IDs (e.g. "rest", "workflow")
	Plugins            []string      // selected plugin IDs  (e.g. "mind", "agents")
	DemoMode           bool          // generate demo workflow template
	GatewayCredentials *GatewayCreds // non-nil → write adapterOptions.llm (demo only)
	PreservedLLMOptions json.RawMessage // non-nil → write adapterOptions.llm verbatim (update preserve)
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
	return os.WriteFile(path, []byte(content), 0o644)
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

	// Gateway secrets stay in projectDir (gitignored) — never in platformDir.
	if gc := opts.GatewayCredentials; gc != nil {
		if err := writeEnvFile(projectDir, gc); err != nil {
			return fmt.Errorf("scaffold .env: %w", err)
		}
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
func ReadPlatformOptions(platformDir string) Options {
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
	}
	if err := json.Unmarshal([]byte(cleaned), &cfg); err != nil {
		return opts
	}

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
	// Preserve existing LLM adapter options (e.g. gateway URL + credentials)
	// so that kb-create update does not reset --llm configuration.
	if len(cfg.AdapterOptions.LLM) > 0 && string(cfg.AdapterOptions.LLM) != "{}" && string(cfg.AdapterOptions.LLM) != "null" {
		opts.PreservedLLMOptions = cfg.AdapterOptions.LLM
	}
	return opts
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

// generateFull produces the complete platform config written to platformDir.
// Contains all sections: adapters, adapterOptions, execution, services, plugins.
func generateFull(opts Options) string {
	svcSet := toSet(opts.Services)
	plugSet := toSet(opts.Plugins)

	var b strings.Builder

	b.WriteString(`{
  // ─── KB Labs Platform Configuration ───────────────────────────────────
  //
  // This file is managed by kb-create. Do not edit by hand.
  // To override settings for your project, add them to:
  //   projectDir/.kb/kb.config.jsonc
  //
  // Docs:  https://kb-labs.dev/docs/configuration
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
	b.WriteString(`      // LLM via KB Labs Gateway — 50 free requests included.
      // Replace with @kb-labs/adapters-openai when you have your own API key.
      "llm": "@kb-labs/adapters-kblabs-gateway",

      // File storage backend.
      "storage": "@kb-labs/adapters-fs",

      // Structured logger.
      "logger": "@kb-labs/adapters-pino",

      // In-memory log ring buffer for recent log access.
      "logRingBuffer": "@kb-labs/adapters-log-ringbuffer",

      // Analytics — JSONL file, no native dependencies.
      "analytics": "@kb-labs/adapters-analytics-file"
    },

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
		b.WriteString("    // Docs: https://kb-labs.dev/docs/llm\n")
		b.WriteString("    \"llm\": {},\n")
	}
	b.WriteString("    \"storage\": { \"baseDir\": \".kb/storage\" },\n")
	b.WriteString("    \"logger\": { \"level\": \"info\" },\n")
	b.WriteString("    \"logRingBuffer\": { \"maxSize\": 100 },\n")
	b.WriteString("    \"analytics\": { \"filename\": \".kb/analytics/events.jsonl\" }\n")
	b.WriteString("  },\n\n")

	// ── gateway section ───────────────────────────────────────────────────
	b.WriteString(`  // ─── Gateway ──────────────────────────────────────────────────────────
  // API gateway upstream routing. Gateway (:4000) proxies these services.
  // /ready checks that the "rest" upstream is up — keep this section present.
  "gateway": {
    "upstreams": {
      // REST API — main platform BFF.
      "rest": { "url": "http://localhost:5050", "prefix": "/api/v1", "websocket": true },
      // Workflow daemon — execution engine.
      "workflow": { "url": "http://localhost:7778", "prefix": "/api/exec", "rewritePrefix": "" },
      // Marketplace service — entity management.
      "marketplace": { "url": "http://localhost:5070", "prefix": "/api/v1/marketplace" },
      // Plugin widget bundles — static files served by REST API.
      "widgets": { "url": "http://localhost:5050", "prefix": "/plugins" }
    }
  },

`)

	// ── services section ──────────────────────────────────────────────────
	b.WriteString(`  // ─── Services ─────────────────────────────────────────────────────────
  // Background daemons. Enable/disable based on what you installed.
  "services": {
`)
	writeToggle(&b, "rest", "REST API daemon on port 5050.", svcSet)
	writeToggle(&b, "workflow", "Workflow engine on port 7778.", svcSet)
	writeToggle(&b, "studio", "Web UI on port 3000.", svcSet)
	b.WriteString(`  },

`)

	// ── plugins section ───────────────────────────────────────────────────
	b.WriteString(`  // ─── Plugins ──────────────────────────────────────────────────────────
  // Optional functionality. Each plugin can have its own nested config.
  "plugins": {
`)
	writePluginBlock(&b, "mind", "AI-powered code search (RAG).", plugSet, `
      // Vector store for embeddings.
      // "local" = on-disk HNSW index, "qdrant" = external Qdrant server.
      "vectorStore": "local"`)
	writePluginBlock(&b, "agents", "Autonomous agent execution.", plugSet, `
      // Max steps per agent run (prevents infinite loops).
      "maxSteps": 25`)
	writePluginBlock(&b, "ai-review", "AI code review.", plugSet, `
      // Review mode: "heuristic" (fast), "llm" (smart), "full" (both).
      "mode": "full"`)
	writePluginBlock(&b, "commit", "AI-powered commit message generation.", plugSet, `
      // Auto-stage changed files before generating commit.
      "autoStage": false`)
	writePluginBlock(&b, "scaffold", "Scaffold plugins and adapters.", plugSet, `
      // Output directory for scaffolded entities.
      "outDir": "plugins"`)
	b.WriteString(`  }
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
  // Docs: https://kb-labs.dev/docs/configuration

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
func writePluginBlock(b *strings.Builder, id, comment string, enabled map[string]bool, inner string) {
	on := enabled[id]
	fmt.Fprintf(b, "    // %s\n", comment)
	fmt.Fprintf(b, "    %s: {\n", quote(id))
	if on {
		fmt.Fprintf(b, "      \"enabled\": true,")
	} else {
		fmt.Fprintf(b, "      \"enabled\": false,")
	}
	b.WriteString(inner)
	b.WriteString("\n    },\n")
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
# Run:  kb workflow run healthcheck
# Docs: https://kb-labs.dev/docs/workflows
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
# Run:  kb workflow run deploy-with-approval
# Docs: https://kb-labs.dev/docs/workflows
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
# Docs: https://kb-labs.dev/docs/workflows
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

// writeEnvFile writes gateway credentials to .env in the project root.
// This file is gitignored by ensureGitignore, keeping secrets out of version control.
func writeEnvFile(projectDir string, gc *GatewayCreds) error {
	path := filepath.Join(projectDir, ".env")

	// Append to existing .env if present.
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600) // #nosec G304
	if err != nil {
		return err
	}
	defer f.Close()

	var buf strings.Builder
	buf.WriteString("\n# KB Labs Gateway credentials (auto-configured by kb-create)\n")
	buf.WriteString("KB_GATEWAY_CLIENT_ID=" + gc.ClientID + "\n")
	buf.WriteString("KB_GATEWAY_CLIENT_SECRET=" + gc.ClientSecret + "\n")
	_, err = f.WriteString(buf.String())
	return err
}

// ensureGitignore appends KB Labs ignore rules to .gitignore if not already present.
// Uses sentinel markers so re-runs are idempotent and existing user content is preserved.
func ensureGitignore(projectDir string) error {
	const (
		marker = "# kb-labs-ignore"
		block  = "\n# kb-labs-ignore\n.env\n.kb/analytics/\n.kb/cache/\n.kb/ai-review/\n.kb/storage/\n.kb/tmp/\n.kb/logs/\n.kb/commit/\n.kb/mind/\n.kb/database/\n# installer-managed — use .kb/devservices.dev.yaml for local dev\n.kb/devservices.yaml\n# installer-managed — use .kb/kb.config.json for local dev\n.kb/kb.config.jsonc\n# end-kb-labs-ignore\n"
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
# Run:  kb run demo
# Edit: kb workflow edit demo
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
