package cmd

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/kb-labs/devkit/internal/engine"
	"github.com/kb-labs/devkit/internal/workspace"
	"github.com/spf13/cobra"
)

var (
	runAffected    bool
	runPackages    []string
	runNoCache     bool
	runLive        bool
	runConcurrency int
)

var runCmd = &cobra.Command{
	Use:   "run <task> [task2 ...]",
	Short: "Run tasks across the workspace with content-addressable caching",
	Long: `Runs one or more named tasks (build, lint, test, type-check, or custom)
across all packages in dependency order.

Results are cached by input hash — identical inputs skip execution and
restore outputs instantly. Cache lives in .kb/devkit/.

Examples:
  kb-devkit run build
  kb-devkit run build lint
  kb-devkit run build lint test --affected
  kb-devkit run build --packages @acme/core-types,@acme/core-runtime
  kb-devkit run build --no-cache
  kb-devkit run deploy`,
	Args: cobra.MinimumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		ws, cfg, err := loadWorkspace()
		if err != nil {
			return err
		}

		// Require tasks to be declared in devkit.yaml.
		if len(cfg.Tasks) == 0 {
			return fmt.Errorf("no tasks defined in devkit.yaml\n\n  Add a tasks: section or run `kb-devkit init` to generate a starter config")
		}

		// Resolve package filter.
		var pkgs []workspace.Package
		switch {
		case runAffected:
			pkgs, err = engine.AffectedPackages(ws, cfg)
			if err != nil {
				return fmt.Errorf("affected: %w", err)
			}
			if len(pkgs) == 0 {
				o := newOutput()
				o.OK("No affected packages — nothing to run")
				return nil
			}
		case len(runPackages) > 0:
			pkgs = ws.FilterByName(runPackages)
			if len(pkgs) == 0 {
				return fmt.Errorf("no packages matched: %s", strings.Join(runPackages, ", "))
			}
		}

		cacheRoot := filepath.Join(ws.Root, ".kb", "devkit")

		opts := engine.RunOptions{
			Tasks:       args,
			Packages:    pkgs,
			NoCache:     runNoCache,
			LiveOutput:  runLive,
			Concurrency: runConcurrency,
			WSRoot:      ws.Root,
			CacheRoot:   cacheRoot,
		}

		o := newOutput()

		if !jsonMode {
			fmt.Println()
			opts.OnResult = func(r engine.TaskResult, done, total int) {
				printTaskResult(o, r, done, total)
			}
		}

		start := time.Now()
		result, err := engine.Run(ws, cfg, opts)
		elapsed := time.Since(start)
		if err != nil {
			return err
		}

		if jsonMode {
			_ = JSONOut(map[string]any{
				"ok":      result.OK,
				"results": result.Results,
				"summary": result.Summary(),
				"elapsed": elapsed.String(),
			})
			if !result.OK {
				return errSilent
			}
			return nil
		}

		// Summary line.
		s := result.Summary()
		fmt.Printf("\n  %s  %s  %s  — %s\n\n",
			o.healthy.Render(fmt.Sprintf("%d passed", s.Passed)),
			o.dim.Render(fmt.Sprintf("%d cached", s.Cached)),
			colorCount(s.Failed, o),
			elapsed.Round(time.Millisecond),
		)

		if !result.OK {
			return fmt.Errorf("tasks failed")
		}
		return nil
	},
}

func init() {
	runCmd.Flags().BoolVar(&runAffected, "affected", false, "run only changed packages + all downstream dependents")
	runCmd.Flags().StringSliceVar(&runPackages, "packages", nil, "run specific packages (comma-separated)")
	runCmd.Flags().BoolVar(&runNoCache, "no-cache", false, "bypass cache lookup (still stores result)")
	runCmd.Flags().BoolVar(&runLive, "live", false, "stream output while running (forces concurrency=1)")
	runCmd.Flags().IntVar(&runConcurrency, "concurrency", 0, "parallel task limit (default: NumCPU-1)")
	rootCmd.AddCommand(runCmd)
}

func colorCount(n int, o output) string {
	if n == 0 {
		return o.dim.Render("0 failed")
	}
	return o.errStyle.Render(fmt.Sprintf("%d failed", n))
}

func printTaskResult(o output, r engine.TaskResult, done, total int) {
	counter := o.dim.Render(fmt.Sprintf("[%3d/%-3d]", done, total))
	ts := o.dim.Render(time.Now().Format("15:04:05"))

	var icon, status string
	switch {
	case r.Cached:
		icon = o.dim.Render("-")
		status = o.dim.Render("cached")
	case r.OK:
		icon = o.StatusIcon("healthy")
		status = o.dim.Render(r.Elapsed.Round(time.Millisecond).String())
	default:
		icon = o.StatusIcon("error")
		status = o.errStyle.Render("FAILED")
	}

	// Truncate long package names.
	name := r.Package
	if len(name) > 42 {
		name = "…" + name[len(name)-41:]
	}

	fmt.Printf("  %s %s %s %-42s  %-12s  %s\n",
		ts,
		counter,
		icon,
		name,
		o.dim.Render("["+r.Task+"]"),
		status,
	)

	// Print error output inline.
	if !r.OK && !r.Cached {
		out := r.Stderr
		if out == "" {
			out = r.Stdout
		}
		lines := strings.SplitN(strings.TrimSpace(out), "\n", 12)
		limit := 10
		if len(lines) < limit {
			limit = len(lines)
		}
		for _, line := range lines[:limit] {
			fmt.Printf("           %s\n", o.dim.Render(line))
		}
		if len(lines) > 10 {
			fmt.Printf("           %s\n", o.dim.Render("... (truncated)"))
		}
	}
}
