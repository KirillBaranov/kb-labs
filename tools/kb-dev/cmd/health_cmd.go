package cmd

import (
	"fmt"

	"github.com/kb-labs/dev/internal/manager"
	"github.com/spf13/cobra"
)

var healthCmd = &cobra.Command{
	Use:   "health",
	Short: "Run health probes on all services",
	Args:  cobra.NoArgs,
	RunE:  runHealth,
}

func init() {
	rootCmd.AddCommand(healthCmd)
}

func runHealth(_ *cobra.Command, _ []string) error {
	if allProjects {
		return runFleetHealth()
	}
	mgr, err := loadManager()
	if err != nil {
		return err
	}

	result := mgr.Health()

	if jsonMode {
		return JSONOut(result)
	}

	out := newOutput()
	cfg := mgr.Config()

	fmt.Println()
	fmt.Println(out.label.Render("Health Check"))
	fmt.Println()

	for _, group := range cfg.GroupOrder() {
		services := cfg.Groups[group]
		if len(services) == 0 {
			continue
		}

		fmt.Printf("  %s\n", out.dim.Render("["+group+"]"))

		for _, id := range services {
			sh, ok := result.Services[id]
			if !ok {
				// No health check configured.
				fmt.Printf("    %s %s  %s\n", out.StatusIcon("dead"), Pad(id, 20), out.dim.Render("no health check"))
				continue
			}

			if sh.OK {
				latency := sh.Latency
				if sh.Slow {
					latency = out.degraded.Render(latency + " (slow)")
				}
				fmt.Printf("    %s %s  %s\n", out.StatusIcon("alive"), Pad(id, 20), latency)
			} else {
				fmt.Printf("    %s %s  %s\n", out.StatusIcon("failed"), Pad(id, 20), out.failed.Render("failing"))
			}
		}
	}
	fmt.Println()

	if !result.OK {
		return errSilent
	}
	return nil
}

type fleetHealth struct {
	OK       bool                       `json:"ok"`
	Projects map[string]fleetHealthItem `json:"projects"`
}

type fleetHealthItem struct {
	Path   string                `json:"path"`
	Health *manager.HealthResult `json:"health,omitempty"`
	Error  string                `json:"error,omitempty"`
}

func runFleetHealth() error {
	items, err := loadFleetManagers()
	if err != nil {
		return err
	}
	result := fleetHealth{OK: true, Projects: make(map[string]fleetHealthItem, len(items))}
	for _, item := range items {
		entry := fleetHealthItem{Path: item.Path, Error: item.Error}
		if item.Mgr != nil {
			health := item.Mgr.Health()
			entry.Health = health
			if !health.OK {
				result.OK = false
			}
		} else {
			result.OK = false
		}
		result.Projects[item.Alias] = entry
	}
	if jsonMode {
		return JSONOut(result)
	}
	out := newOutput()
	fmt.Println()
	fmt.Println(out.label.Render("KB Labs Fleet Health"))
	for _, item := range items {
		if item.Mgr == nil {
			fmt.Printf("  %s %s  %s\n", out.StatusIcon("failed"), Pad(item.Alias, 22), out.failed.Render(item.Error))
			continue
		}
		health := item.Mgr.Health()
		state := "alive"
		if !health.OK {
			state = "failed"
		}
		fmt.Printf("  %s %s %s\n", out.StatusIcon(state), Pad(item.Alias, 22), out.StatusColor(state))
	}
	fmt.Println()
	if !result.OK {
		return errSilent
	}
	return nil
}
