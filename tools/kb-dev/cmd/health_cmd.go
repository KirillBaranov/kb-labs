package cmd

import (
	"fmt"

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
