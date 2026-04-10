package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show service status table",
	Args:  cobra.NoArgs,
	RunE:  runStatus,
}

func init() {
	rootCmd.AddCommand(statusCmd)
}

func runStatus(_ *cobra.Command, _ []string) error {
	mgr, err := loadManager()
	if err != nil {
		return err
	}

	result := mgr.Status()

	if jsonMode {
		return JSONOut(result)
	}

	out := newOutput()
	cfg := mgr.Config()

	fmt.Println()
	fmt.Println(out.label.Render("KB Labs Services"))

	for _, group := range cfg.GroupOrder() {
		services := cfg.Groups[group]
		if len(services) == 0 {
			continue
		}

		fmt.Printf("\n  %s\n", out.dim.Render("["+group+"]"))

		for _, id := range services {
			ss, ok := result.Services[id]
			if !ok {
				continue
			}

			portStr := "-"
			if ss.Port > 0 {
				portStr = fmt.Sprintf("%d", ss.Port)
			}

			latencyStr := ""
			if ss.Health != nil {
				latencyStr = ss.Health.Latency
				if ss.Health.Slow {
					latencyStr = out.degraded.Render(latencyStr)
				}
			}

			extras := ""
			if ss.Uptime != "" {
				extras += "  " + out.dim.Render(ss.Uptime)
			}
			if latencyStr != "" {
				extras += "  " + latencyStr
			}
			if ss.Resources != nil {
				cpuStr := ss.Resources.CPU
				memStr := ss.Resources.Memory
				// Highlight high CPU (>50%) or high memory (>500MB).
				if ss.Resources.RSS > 500*1024*1024 {
					memStr = out.degraded.Render(memStr)
				}
				extras += "  " + out.dim.Render(cpuStr+" / "+memStr)
			}

			fmt.Printf("  %s %s%s%s%s%s\n",
				out.StatusIcon(ss.State),
				Pad(id, 20),
				Pad(portStr, 8),
				out.StatusColor(Pad(ss.State, 12)),
				Pad(ss.URL, 0),
				extras,
			)

			if ss.Detail != "" {
				out.Detail(ss.Detail)
			}
		}
	}

	fmt.Println()
	s := result.Summary
	fmt.Printf("  %s  %s  %s  %s  (%d total)\n",
		out.alive.Render(fmt.Sprintf("%d alive", s.Alive)),
		out.starting.Render(fmt.Sprintf("%d starting", s.Starting)),
		out.failed.Render(fmt.Sprintf("%d failed", s.Failed)),
		out.dead.Render(fmt.Sprintf("%d dead", s.Dead)),
		s.Total,
	)
	fmt.Println()

	return nil
}
