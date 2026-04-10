package cmd

import (
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
	results := make([]monitor.StatusResult, 0, len(names))

	for _, name := range names {
		t := cfg.Targets[name]

		client, err := connectTarget(t)
		if err != nil {
			res := monitor.StatusResult{Service: name, Health: "unknown"}
			results = append(results, res)
			if !jsonMode {
				o.Err(Pad(name, 20) + "  " + err.Error())
			}
			continue
		}

		res, err := monitor.FetchStatus(client, t.Remote.ComposeFile, t.Remote.Service)
		client.Close()
		res.Service = name

		if err != nil {
			res.Health = "unknown"
		}
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
