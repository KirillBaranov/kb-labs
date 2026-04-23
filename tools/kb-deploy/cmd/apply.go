package cmd

import (
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/kb-labs/kb-deploy/internal/config"
	"github.com/kb-labs/kb-deploy/internal/lock"
	"github.com/kb-labs/kb-deploy/internal/orchestrator"
	"github.com/kb-labs/kb-deploy/internal/remote"
)

var (
	applyYes    bool
	applyDryRun bool
)

var applyCmd = &cobra.Command{
	Use:   "apply",
	Short: "Declaratively apply deploy.yaml across a fleet of hosts",
	Long: `apply reads .kb/deploy.yaml, computes a rollout plan based on each
host's current state, and executes the plan wave by wave. The previous lock
is consulted to detect drift; the new lock is written on success.

Exit codes:
  0  no changes applied (or dry-run complete)
  1  changes applied successfully
  2  error (validation, SSH, build)
  3  rollback fired and succeeded

Examples:
  kb-deploy apply                  # uses .kb/deploy.yaml
  kb-deploy apply --dry-run        # compute plan, do not execute
  kb-deploy apply --yes            # skip confirmation in interactive shells
  kb-deploy apply --config path/to/deploy.yaml`,
	SilenceUsage: true,
	RunE:         runApply,
}

func init() {
	applyCmd.Flags().BoolVar(&applyYes, "yes", false, "skip confirmation prompt")
	applyCmd.Flags().BoolVar(&applyDryRun, "dry-run", false, "compute plan, do not execute")
	rootCmd.AddCommand(applyCmd)
}

func runApply(cmd *cobra.Command, args []string) error {
	flow, err := loadFlow()
	if err != nil {
		return err
	}
	defer flow.CloseAll()

	// Warn for autoCommit + unprotected repo (D22).
	if flow.Cfg.Rollout != nil && flow.Cfg.Rollout.LockMode == "autoCommit" {
		fmt.Fprintln(cmd.ErrOrStderr(),
			"warning: rollout.lockMode=autoCommit requires branch protection on the deploy repo. "+
				"See docs/guides/delivery.md#lock-modes")
	}

	// Print plan and drift.
	fmt.Fprintln(cmd.OutOrStdout(), flow.Plan.String())
	printDrift(cmd, flow.Drift)
	sum := flow.Plan.Summary()
	fmt.Fprintf(cmd.OutOrStdout(),
		"summary: install=%d swap=%d restart=%d skip=%d\n",
		sum.Install, sum.Swap, sum.Restart, sum.Skip)

	if !flow.Plan.HasChanges() {
		fmt.Fprintln(cmd.OutOrStdout(), "no changes to apply")
		return nil
	}
	if applyDryRun {
		fmt.Fprintln(cmd.OutOrStdout(), "dry-run complete; nothing executed")
		return nil
	}

	// Execute.
	hosts := flow.Hosts
	resolver := func(name string) (*remote.Host, error) {
		h, ok := hosts[name]
		if !ok {
			return nil, fmt.Errorf("no SSH connection for host %q", name)
		}
		return h, nil
	}
	res := orchestrator.Execute(orchestrator.ExecuteOptions{
		Plan:     flow.Plan,
		Config:   flow.Cfg,
		Resolver: resolver,
		Stdout:   cmd.OutOrStdout(),
		Stderr:   cmd.ErrOrStderr(),
	})

	if res.Err == nil {
		if err := writeLock(flow.Cfg, flow.CfgPath, flow.Plan); err != nil {
			return fmt.Errorf("write lock: %w", err)
		}
		fmt.Fprintln(cmd.OutOrStdout(), "apply successful; lock updated")
		return nil
	}
	fmt.Fprintf(cmd.ErrOrStderr(), "apply failed: %v\n", res.Err)
	if len(res.RolledBack) > 0 {
		fmt.Fprintf(cmd.ErrOrStderr(), "rolled back %d host(s)\n", len(res.RolledBack))
		os.Exit(3) //nolint:gocritic // explicit exit-code contract
	}
	os.Exit(2)
	return nil
}

func printDrift(cmd *cobra.Command, drift []DriftItem) {
	if len(drift) == 0 {
		return
	}
	fmt.Fprintln(cmd.OutOrStdout(), "\nDrift detected:")
	for _, d := range drift {
		fmt.Fprintf(cmd.OutOrStdout(),
			"  %s/%s: lock=%s target=%s\n", d.Host, d.Service, d.LockSays, d.Target)
	}
	fmt.Fprintln(cmd.OutOrStdout(),
		"Options: 'kb-deploy apply' to reconcile to lock, or 'kb-deploy adopt' to update lock from target state.")
}

// writeLock persists the outcome of a successful apply.
func writeLock(cfg *config.Config, cfgPath string, plan *orchestrator.Plan) error {
	l := lock.New("kb-deploy")
	if cfg.Platform != nil {
		l.Platform.Version = cfg.Platform.Version
	}
	for name, svc := range cfg.Services {
		sl := lock.ServiceLock{
			Resolved: fmt.Sprintf("%s@%s", svc.Service, svc.Version),
			Adapters: adaptersToLock(svc.Adapters),
			Plugins:  pluginsToLock(svc.Plugins),
		}
		appliedTo := map[string]lock.HostApplication{}
		for _, wave := range plan.Waves {
			for _, a := range wave {
				if a.Service != name {
					continue
				}
				appliedTo[a.Host] = lock.HostApplication{
					ReleaseID: chooseReleaseID(a),
					AppliedAt: time.Now().UTC(),
				}
			}
		}
		if len(appliedTo) > 0 {
			sl.AppliedTo = appliedTo
		}
		l.Services[name] = sl
	}
	return l.Save(cfgPath)
}

func chooseReleaseID(a orchestrator.Action) string {
	if a.ToID != "" {
		return a.ToID
	}
	return a.FromID
}

func adaptersToLock(in map[string]string) map[string]lock.ResolvedDep {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]lock.ResolvedDep, len(in))
	for role, spec := range in {
		out[role] = lock.ResolvedDep{Resolved: spec}
	}
	return out
}

func pluginsToLock(in map[string]string) map[string]lock.ResolvedDep {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]lock.ResolvedDep, len(in))
	for pkg, ver := range in {
		out[pkg] = lock.ResolvedDep{Resolved: pkg + "@" + ver}
	}
	return out
}
