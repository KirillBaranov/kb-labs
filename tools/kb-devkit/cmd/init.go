package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

// initTemplate is built via concatenation to avoid a raw backtick inside a
// Go raw string literal (which cannot contain a backtick character).
var initTemplate = strings.Join([]string{
	"schemaVersion: 2",
	"extends: [builtin:generic]",
	"",
	"# ── Workspace ─────────────────────────────────────────────────────────────────",
	"workspace:",
	"  packageManager: pnpm   # pnpm | npm | yarn",
	"  # discovery: [\"packages/**\", \"apps/**\"]",
	"  # maxDepth: 3          # how deep to scan for ** globs (default: 3)",
	"",
	"# categories:",
	"#   lib:",
	"#     match: [\"packages/**\"]",
	"#     preset: node-lib",
	"#   app:",
	"#     match: [\"apps/**\"]",
	"#     preset: node-app",
	"",
	"# ── Tasks ─────────────────────────────────────────────────────────────────────",
	"# Define tasks once; kb-devkit runs them across all packages in dep order.",
	"# Cache key = SHA256(inputs). Identical inputs → restore outputs in ~1ms.",
	"#",
	"# Dep syntax:",
	`#   "^build"  — run build for every workspace dependency first (like Turbo ^)`,
	`#   "build"   — run build for the same package first`,
	"#",
	"# tasks:",
	"#   build:",
	`#     command: tsup`,
	`#     inputs:  ["src/**", "tsup.config.ts", "tsconfig*.json"]`,
	`#     outputs: ["dist/**"]`,
	`#     deps:    ["^build"]`,
	"#",
	"#   lint:",
	"#     command: eslint src/",
	`#     inputs:  ["src/**", "eslint.config.*"]`,
	"#     outputs: []",
	"#",
	"#   type-check:",
	"#     command: tsc --noEmit",
	`#     inputs:  ["src/**", "tsconfig*.json"]`,
	"#     outputs: []",
	`#     deps:    ["^build"]`,
	"#",
	"#   test:",
	"#     command: vitest run --passWithNoTests",
	`#     inputs:  ["src/**", "test/**", "vitest.config.*"]`,
	`#     outputs: ["coverage/**"]`,
	`#     deps:    ["build"]`,
	"#",
	"#   deploy:",
	"#     command: ./scripts/deploy.sh",
	`#     inputs:  ["dist/**"]`,
	"#     cache:   false   # always runs — never restored from cache",
	"",
	"# ── Affected detection ────────────────────────────────────────────────────────",
	"# Controls which packages --affected considers changed.",
	"#",
	"# affected:",
	"#   strategy: git         # git | submodules | command",
	"#   #   git        — git diff --name-only HEAD from workspace root",
	"#   #   submodules — walks .gitmodules, diffs inside each submodule",
	"#   #   command    — runs a custom script, reads file paths from stdout",
	"#   # command: ./scripts/changed-files.sh",
	"",
	"# ── Packs and extensions ─────────────────────────────────────────────────────",
	"# Compose policy from built-in, local, or package-provided YAML packs.",
	"#",
	"# extends:",
	"#   - builtin:generic",
	"#   - ./devkit/packs/frontend.yaml",
	"#   - package:@acme/devkit-pack#devkit.pack.yaml",
	"",
	"# ── Optional policy overrides ─────────────────────────────────────────────────",
	"# checks:",
	"#   packages:",
	"#     generic:",
	"#       enabled: true",
	"#       # config:",
	"#       #   requiredFile: README.md",
	"#",
	"# custom_checks:",
	"#   - name: external-readme",
	"#     run: ./node_modules/@acme/devkit-pack/bin/external-readme.sh",
	"#     fix: ./node_modules/@acme/devkit-pack/bin/external-readme.sh",
	"#     on: [check]",
	"#     language: typescript",
	"#",
	"# fix:",
	"#   defaultMode: safe",
	"#",
	"# reporting:",
	"#   verbose: false",
	"",
}, "\n")

var initForce bool

var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Create a starter devkit.yaml in the current directory",
	Long: `Writes a compact devkit.yaml starter config.
Add categories/tasks you need, optionally extend it with YAML packs, then run
kb-devkit check or kb-devkit run build.

If devkit.yaml already exists, the command exits with an error unless --force is passed.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		dir, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("cannot determine working directory: %w", err)
		}

		dest := filepath.Join(dir, "devkit.yaml")

		if !initForce {
			if _, err := os.Stat(dest); err == nil {
				return fmt.Errorf("devkit.yaml already exists (use --force to overwrite)")
			}
		}

		if err := os.WriteFile(dest, []byte(initTemplate), 0o644); err != nil {
			return fmt.Errorf("write devkit.yaml: %w", err)
		}

		o := newOutput()
		o.OK("Created devkit.yaml")
		fmt.Println()
		fmt.Println("  Add categories, tasks, or packs, then:")
		fmt.Println()
		fmt.Printf("  %s\n", o.dim.Render("kb-devkit run build"))
		fmt.Printf("  %s\n", o.dim.Render("kb-devkit check"))
		fmt.Println()
		return nil
	},
}

func init() {
	initCmd.Flags().BoolVar(&initForce, "force", false, "overwrite existing devkit.yaml")
	rootCmd.AddCommand(initCmd)
}
