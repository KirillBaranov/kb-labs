package cmd

import (
	"github.com/kb-labs/kb-monitor/internal/config"
	"github.com/kb-labs/kb-monitor/internal/monitor"
	"github.com/spf13/cobra"
)

var healthCmd = &cobra.Command{
	Use:   "health [target]",
	Short: "Check health status of deployed services",
	Args:  cobra.MaximumNArgs(1),
	RunE:  runHealth,
}

func init() {
	rootCmd.AddCommand(healthCmd)
}

type healthResult struct {
	Target string `json:"target"`
	Status string `json:"status"`
	Error  string `json:"error,omitempty"`
}

func runHealth(cmd *cobra.Command, args []string) error {
	cfg, _, err := loadConfig()
	if err != nil {
		return err
	}

	filter := ""
	if len(args) == 1 {
		filter = args[0]
	}
	names, err := sortedTargetNames(cfg, filter)
	if err != nil {
		return err
	}

	o := newOutput()
	results := make([]healthResult, 0, len(names))
	pool := newClientPool()
	defer pool.closeAll()

	// Group targets by host key so we can run all containers in one SSH session per host.
	type group struct {
		target    config.Target
		names     []string
		containers []string
	}
	hostOrder := []string{}
	groups := map[string]*group{}

	for _, name := range names {
		t := cfg.Targets[name]
		key := t.SSH.User + "@" + t.SSH.Host
		if _, ok := groups[key]; !ok {
			hostOrder = append(hostOrder, key)
			groups[key] = &group{target: t}
		}
		groups[key].names = append(groups[key].names, name)
		groups[key].containers = append(groups[key].containers, t.Remote.Container())
	}

	// Collect permission-denied results first (no SSH needed).
	permDenied := map[string]bool{}
	for _, name := range names {
		t := cfg.Targets[name]
		if !t.Perms().Health {
			res := healthResult{Target: name, Status: "unknown", Error: "health check not permitted"}
			results = append(results, res)
			permDenied[name] = true
			if !jsonMode {
				o.Warn(Pad(name, 20) + "  permission denied")
			}
		}
	}

	// For each host group, one SSH session for all containers.
	for _, key := range hostOrder {
		g := groups[key]

		// Filter out perm-denied targets.
		filteredNames := make([]string, 0)
		filteredContainers := make([]string, 0)
		for i, name := range g.names {
			if !permDenied[name] {
				filteredNames = append(filteredNames, name)
				filteredContainers = append(filteredContainers, g.containers[i])
			}
		}
		if len(filteredNames) == 0 {
			continue
		}

		client, err := pool.get(g.target)
		if err != nil {
			for _, name := range filteredNames {
				res := healthResult{Target: name, Status: "unknown", Error: err.Error()}
				results = append(results, res)
				if !jsonMode {
					o.Err(Pad(name, 20) + "  " + err.Error())
				}
			}
			continue
		}

		statuses, _ := monitor.CheckHealthAll(client, filteredContainers)
		for i, name := range filteredNames {
			status := "unknown"
			if i < len(statuses) {
				status = statuses[i]
			}
			res := healthResult{Target: name, Status: status}
			results = append(results, res)
			if !jsonMode {
				switch status {
				case "healthy", "running":
					o.OK(Pad(name, 20) + "  " + status)
				case "stopped", "unhealthy":
					o.Err(Pad(name, 20) + "  " + status)
				default:
					o.Warn(Pad(name, 20) + "  " + status)
				}
			}
		}
	}

	// Re-sort results to match original name order.
	ordered := make([]healthResult, 0, len(results))
	for _, name := range names {
		for _, r := range results {
			if r.Target == name {
				ordered = append(ordered, r)
				break
			}
		}
	}

	if jsonMode {
		return JSONOut(map[string]any{"ok": true, "results": ordered})
	}
	return nil
}
