// Package scaffold generates the initial .kb/kb.config.jsonc for new projects.
// The file uses JSONC (JSON with Comments) so users get inline documentation
// for every section — same pattern as tsconfig.json.
package scaffold

import (
	"fmt"
	"os"
	"path/filepath"
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
	Services           []string     // selected service IDs (e.g. "rest", "workflow")
	Plugins            []string     // selected plugin IDs  (e.g. "mind", "agents")
	DemoMode           bool         // generate demo workflow template
	GatewayCredentials *GatewayCreds // non-nil → write adapterOptions.llm (demo only)
}

// WriteProjectConfig generates .kb/kb.config.jsonc inside projectDir.
func WriteProjectConfig(projectDir string, opts Options) error {
	dir := filepath.Join(projectDir, ".kb")
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return fmt.Errorf("create .kb dir: %w", err)
	}

	content := generate(opts)
	path := filepath.Join(dir, "kb.config.jsonc")
	// #nosec G306 -- project config is expected to be readable in workspace.
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return err
	}

	if opts.DemoMode {
		if err := writeDemoWorkflow(dir); err != nil {
			return fmt.Errorf("scaffold demo workflow: %w", err)
		}
	}

	return nil
}

func generate(opts Options) string {
	svcSet := toSet(opts.Services)
	plugSet := toSet(opts.Plugins)

	var b strings.Builder

	b.WriteString(`{
  // ─── KB Labs Project Configuration ────────────────────────────────────
  //
  // This file configures the KB Labs platform for your project.
  // Format: JSONC (JSON with Comments) — same as tsconfig.json.
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
	if opts.GatewayCredentials != nil {
		b.WriteString("      // LLM via KB Labs Gateway (auto-configured by kb-create --demo).\n")
		b.WriteString("      // Replace with @kb-labs/adapters-openai when you have your own API key.\n")
		b.WriteString("      \"llm\": \"@kb-labs/adapters-kblabs-gateway\",\n")
	} else {
		b.WriteString("      // LLM provider(s). Array = fallback chain, string = single provider.\n")
		b.WriteString("      // Available: @kb-labs/adapters-openai, @kb-labs/adapters-kblabs-gateway\n")
		b.WriteString("      \"llm\": \"@kb-labs/adapters-openai\",\n")
	}
	b.WriteString(`
      // Embedding model for vector search (Mind RAG).
      "embeddings": "@kb-labs/adapters-openai/embeddings",

      // File storage backend.
      "storage": "@kb-labs/adapters-fs",

      // Structured logger.
      // Available: @kb-labs/adapters-pino, @kb-labs/adapters-console
      "logger": "@kb-labs/adapters-pino"
    },

    // Plugin execution mode: "worker-pool" (isolated workers, stable) or
    // "in-process" (fast, shared memory — lower isolation).
    "execution": {
      "mode": "worker-pool"
    }
  },

`)

	// ── adapterOptions (demo only) ────────────────────────────────────────
	if gc := opts.GatewayCredentials; gc != nil {
		b.WriteString("  // ─── Adapter Options ────────────────────────────────────────────────────\n")
		b.WriteString("  // Auto-configured by kb-create --demo. Credentials let the adapter refresh\n")
		b.WriteString("  // the JWT token automatically. Replace with your own API key when ready:\n")
		b.WriteString("  // https://kb-labs.dev/docs/llm\n")
		b.WriteString("  \"adapterOptions\": {\n")
		b.WriteString("    \"llm\": {\n")
		fmt.Fprintf(&b, "      \"gatewayURL\": %s,\n", quote(gc.GatewayURL))
		fmt.Fprintf(&b, "      \"kbClientId\": %s,\n", quote(gc.ClientID))
		fmt.Fprintf(&b, "      \"kbClientSecret\": %s\n", quote(gc.ClientSecret))
		b.WriteString("    }\n")
		b.WriteString("  },\n\n")
	}

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
	b.WriteString(`  }
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
