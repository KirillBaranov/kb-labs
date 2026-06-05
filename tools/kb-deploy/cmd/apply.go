package cmd

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"github.com/kb-labs/clikit/diag"
	"github.com/kb-labs/clikit/result"

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
	mode := outputMode()
	human := mode == result.ModeHuman

	flow, err := loadFlow()
	if err != nil {
		return diag.Wrap(err, codeConfigLoad, "failed to load deploy configuration",
			diag.WithReason(err.Error()))
	}
	defer flow.CloseAll()

	// Warn for autoCommit + unprotected repo (D22).
	if human && flow.Cfg.Rollout != nil && flow.Cfg.Rollout.LockMode == "autoCommit" {
		fmt.Fprintln(cmd.ErrOrStderr(),
			"warning: rollout.lockMode=autoCommit requires branch protection on the deploy repo. "+
				"See docs/guides/delivery.md#lock-modes")
	}

	sum := flow.Plan.Summary()
	// Human mode streams the plan inline; machine modes carry it in the final
	// envelope so stdout stays a single parseable object.
	if human {
		fmt.Fprintln(cmd.OutOrStdout(), flow.Plan.String())
		printDrift(cmd, flow.Drift)
		fmt.Fprintf(cmd.OutOrStdout(),
			"summary: install=%d swap=%d restart=%d skip=%d\n",
			sum.Install, sum.Swap, sum.Restart, sum.Skip)
	}
	planData := map[string]any{
		"summary": map[string]any{
			"install": sum.Install, "swap": sum.Swap,
			"restart": sum.Restart, "skip": sum.Skip,
		},
		"hasChanges": flow.Plan.HasChanges(),
		"dryRun":     applyDryRun,
	}

	if !flow.Plan.HasChanges() {
		emit(cmd, result.Success("no changes to apply", planData), mode)
		return nil
	}
	if applyDryRun {
		emit(cmd, result.Success("dry-run complete; nothing executed", planData), mode)
		return nil
	}

	// Execute.
	hosts := flow.Hosts
	resolver := func(name string) (*remote.Host, error) {
		h, ok := hosts[name]
		if !ok {
			return nil, diag.New(codeHostUndefined,
				fmt.Sprintf("no SSH connection for host %q", name))
		}
		return h, nil
	}
	res := orchestrator.Execute(orchestrator.ExecuteOptions{
		Plan:           flow.Plan,
		Config:         flow.Cfg,
		Resolver:       resolver,
		Stdout:         cmd.OutOrStdout(),
		Stderr:         cmd.ErrOrStderr(),
		Configs:        toHostConfigs(flow.Configs),
		PrevConfigHash: prevConfigHashes(flow.Lock),
		ServiceEnv:     flow.ServiceEnv,
	})

	if res.Err != nil {
		// res.Err is a structured *diag.Diag (ERR_WAVE_FAILED) carrying every
		// per-action failure in meta; let the top-level handler render it.
		return res.Err
	}
	if err := writeLock(flow.Cfg, flow.CfgPath, flow.Plan, flow.Configs); err != nil {
		return diag.Wrap(err, codeWriteLock, "apply succeeded but writing the lock failed",
			diag.WithReason(err.Error()))
	}
	emit(cmd, result.Success("apply successful; lock updated", planData), mode)
	return nil
}

// emit renders a successful CommandOutput. In human mode the inline progress was
// already printed, so only the final human line is written; machine modes write
// the JSON/agent envelope.
func emit(cmd *cobra.Command, out result.CommandOutput, mode result.Mode) {
	if mode == result.ModeHuman {
		fmt.Fprintln(cmd.OutOrStdout(), out.Human)
		return
	}
	result.Render(cmd.OutOrStdout(), out, mode)
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

// toHostConfigs adapts the prepared per-host configs into the orchestrator's
// delivery type (decouples cmd's deliveredConfig from the orchestrator).
func toHostConfigs(in map[string]deliveredConfig) map[string]orchestrator.HostConfig {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]orchestrator.HostConfig, len(in))
	for host, dc := range in {
		out[host] = orchestrator.HostConfig{JSONC: dc.JSONC, Env: dc.Env, Hash: dc.Hash}
	}
	return out
}

// prevConfigHashes pulls the per-host config hashes recorded in the lock.
func prevConfigHashes(l *lock.Lock) map[string]string {
	if l == nil || len(l.Hosts) == 0 {
		return nil
	}
	out := make(map[string]string, len(l.Hosts))
	for host, hl := range l.Hosts {
		out[host] = hl.ConfigHash
	}
	return out
}

// writeLock persists the outcome of a successful apply.
func writeLock(cfg *config.Config, cfgPath string, plan *orchestrator.Plan, configs map[string]deliveredConfig) error {
	l := lock.New("kb-deploy")
	if cfg.Platform != nil {
		l.Platform.Version = cfg.Platform.Version
	}
	if len(configs) > 0 {
		l.Hosts = make(map[string]lock.HostLock, len(configs))
		for host, dc := range configs {
			l.Hosts[host] = lock.HostLock{ConfigHash: dc.Hash}
		}
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
