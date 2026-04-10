package cmd

import (
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

	for _, name := range names {
		t := cfg.Targets[name]
		res := healthResult{Target: name}

		if !t.Perms().Health {
			res.Status = "unknown"
			res.Error = "health check not permitted"
			results = append(results, res)
			if !jsonMode {
				o.Warn(Pad(name, 20) + "  permission denied")
			}
			continue
		}

		client, err := connectTarget(t)
		if err != nil {
			res.Status = "unknown"
			res.Error = err.Error()
			results = append(results, res)
			if !jsonMode {
				o.Err(Pad(name, 20) + "  " + err.Error())
			}
			continue
		}

		status, err := monitor.CheckHealth(client, t.Remote.ComposeFile, t.Remote.Service)
		client.Close()

		res.Status = status
		if err != nil {
			res.Error = err.Error()
		}
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

	if jsonMode {
		return JSONOut(map[string]any{"ok": true, "results": results})
	}
	return nil
}
