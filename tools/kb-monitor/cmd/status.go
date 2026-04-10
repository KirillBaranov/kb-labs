package cmd

import (
	"github.com/kb-labs/kb-monitor/internal/config"
	"github.com/kb-labs/kb-monitor/internal/monitor"
	"github.com/spf13/cobra"
)

var statusCmd = &cobra.Command{
	Use:   "status [target]",
	Short: "Show running state, uptime, and image SHA for deployed services",
	Args:  cobra.MaximumNArgs(1),
	RunE:  runStatus,
}

func init() {
	rootCmd.AddCommand(statusCmd)
}

func runStatus(cmd *cobra.Command, args []string) error {
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
	pool := newClientPool()
	defer pool.closeAll()

	// Group targets by host key.
	type group struct {
		target     config.Target
		names      []string
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

	// Collect results indexed by target name.
	byName := map[string]monitor.StatusResult{}

	for _, key := range hostOrder {
		g := groups[key]
		client, err := pool.get(g.target)
		if err != nil {
			for _, name := range g.names {
				byName[name] = monitor.StatusResult{Service: name, Health: "unknown"}
				if !jsonMode {
					o.Err(Pad(name, 20) + "  " + err.Error())
				}
			}
			continue
		}

		fetched, _ := monitor.FetchStatusAll(client, g.containers)
		for i, name := range g.names {
			res := monitor.StatusResult{Service: name, Health: "unknown"}
			if i < len(fetched) {
				res = fetched[i]
				res.Service = name
			}
			byName[name] = res
		}
	}

	// Output in original sorted order.
	results := make([]monitor.StatusResult, 0, len(names))
	for _, name := range names {
		res := byName[name]
		results = append(results, res)

		if !jsonMode {
			state := "stopped"
			if res.Running {
				state = "running"
			}
			o.Bullet(Pad(name, 20), state+"  "+res.Health)
			if res.StartedAt != "" {
				o.Detail("started: " + res.StartedAt)
			}
			if res.ImageSHA != "" {
				sha := res.ImageSHA
				if len(sha) > 19 {
					sha = sha[:19] + "..."
				}
				o.Detail("image:   " + sha)
			}
		}
	}

	if jsonMode {
		return JSONOut(map[string]any{"ok": true, "targets": results})
	}
	return nil
}
