package cmd

import (
	"context"
	"fmt"

	"github.com/kb-labs/dev/internal/config"
	"github.com/kb-labs/dev/internal/manager"
	"github.com/spf13/cobra"
)

var switchKeepOthers bool

var switchCmd = &cobra.Command{
	Use:   "switch <alias>",
	Short: "Stop other registered projects and start <alias>, from anywhere",
	Args:  cobra.ExactArgs(1),
	RunE:  runSwitch,
}

func init() {
	switchCmd.Flags().BoolVar(&switchKeepOthers, "keep-others", false, "don't stop other running registered projects")
	rootCmd.AddCommand(switchCmd)
}

func runSwitch(cmd *cobra.Command, args []string) error {
	alias := args[0]

	platformDir, err := config.ResolvePlatformDir(platformDirFlag)
	if err != nil {
		return err
	}

	mgr, startResult, err := switchToAlias(cmd.Context(), platformDir, alias, switchKeepOthers, false)
	if err != nil {
		return err
	}

	if jsonMode {
		return JSONOut(startResult)
	}
	if !startResult.OK {
		return errSilent
	}
	printHighlights(mgr.Config().Services)
	return nil
}

// switchToAlias resolves alias via the platform's project registry, stops
// every other registered project (unless keepOthers), then starts alias on
// its resolved offset. Returns the started Manager (for callers that want to
// render highlights) and the Start Result.
//
// quiet suppresses the human-readable per-service OK/Info lines (used by
// `kb-dev hook-check`, which wants at most a short notice, not the full start
// log) — it does not affect the hard-error guarantee: a stop that didn't
// actually take effect always returns an error rather than silently piling a
// second instance on top of a still-running project.
func switchToAlias(ctx context.Context, platformDir, alias string, keepOthers, quiet bool) (*manager.Manager, *manager.Result, error) {
	projects, err := config.ReadProjects(platformDir)
	if err != nil {
		return nil, nil, err
	}
	targetPath, ok := projects[alias]
	if !ok {
		return nil, nil, fmt.Errorf("no project registered under alias %q — see `kb-dev projects` or `kb-dev register`", alias)
	}

	out := newOutput()
	notify := func(msg string) {
		if !quiet {
			out.Info(msg)
		}
	}

	// Free up resources from every other registered project before starting
	// the target — otherwise "switching" between a dozen projects just piles
	// up 5 daemons each, never actually releasing anything.
	if !keepOthers {
		for other, path := range projects {
			if other == alias {
				continue
			}
			stopped, serr := stopIfRunning(ctx, path)
			if serr != nil {
				return nil, nil, fmt.Errorf(
					"could not fully stop %q (%s), refusing to start %q on top of it: %w — "+
						"run `kb-dev projects` to inspect, or pass --keep-others to run in parallel",
					other, path, alias, serr,
				)
			}
			if stopped {
				notify(other + " stopped")
			}
		}
	}

	result, err := config.Discover(targetPath)
	if err != nil {
		return nil, nil, fmt.Errorf("registered path for %q is no longer valid: %w", alias, err)
	}
	cfg, err := loadConfig(result.ConfigPath)
	if err != nil {
		return nil, nil, err
	}
	rootDir := config.RootDir(result.ConfigPath)

	offset, err := resolveOffsetForAlias(alias, cfg, rootDir, result.ProjectDir)
	if err != nil {
		return nil, nil, fmt.Errorf("could not find free ports for %q: %w", alias, err)
	}

	mgr, err := loadManagerForProject(result.ConfigPath, result.ProjectDir, offset)
	if err != nil {
		return nil, nil, err
	}

	targets, err := mgr.Config().ResolveTarget("")
	if err != nil {
		return nil, nil, err
	}
	startResult := mgr.Start(ctx, targets, forceFlag)

	if !quiet {
		for _, a := range startResult.Actions {
			switch a.Action {
			case "started":
				out.OK(a.Service + " started (" + a.Elapsed + ")")
			case "skipped":
				out.Info(a.Service + " already running")
			case "failed":
				out.Err(a.Service + " failed: " + a.Error)
				for _, line := range a.LogsTail {
					out.Detail(line)
				}
			}
		}
		if startResult.Hint != "" {
			out.Warn(startResult.Hint)
		}
	}

	return mgr, startResult, nil
}

// stopIfRunning stops every service of the project at path if any are alive,
// then verifies the stop actually took (Manager.Stop already escalates via
// process.KillGroup's grace period — see manager.go stopInternal). Returns
// whether anything was stopped, and an error if a service is still alive
// afterward, so callers never silently start a second instance on top of a
// project that failed to release its ports.
func stopIfRunning(ctx context.Context, path string) (bool, error) {
	result, err := config.Discover(path)
	if err != nil {
		// Registered path no longer resolves to a project — nothing to stop.
		return false, nil
	}
	cfg, err := loadConfig(result.ConfigPath)
	if err != nil {
		return false, err
	}
	rootDir := config.RootDir(result.ConfigPath)
	mgr := manager.New(cfg, rootDir, result.ProjectDir)
	mgr.ResolveEnv()
	_ = mgr.Reconcile()

	targets, err := mgr.Config().ResolveTarget("")
	if err != nil {
		return false, err
	}

	if !anyRunning(mgr, targets) {
		return false, nil
	}

	mgr.Stop(ctx, targets, true, false)
	_ = mgr.Reconcile()

	if anyRunning(mgr, targets) {
		return true, fmt.Errorf("one or more services are still running after stop")
	}
	return true, nil
}

// anyRunning reports whether any target has a live PID — "alive" (healthy),
// "starting", "failed" (PID running but its health check doesn't pass — see
// Manager.Reconcile), or "stopping" all mean a process is still there and
// needs to be stopped before another project starts on the same ports.
// Only "dead" means nothing to do. Checking for "alive" alone would leave an
// unhealthy-but-running service behind: `switch` wouldn't even attempt to
// stop it, and the next project could collide with it or its logs. Reusing
// "dead" as the sole terminal state also matches Reconcile's own semantics
// (it never emits a bare "not found" state distinct from "dead").
func anyRunning(mgr *manager.Manager, targets []string) bool {
	status := mgr.Status()
	for _, id := range targets {
		if ss, ok := status.Services[id]; ok && ss.State != "dead" {
			return true
		}
	}
	return false
}
