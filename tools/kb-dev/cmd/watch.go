package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var watchCmd = &cobra.Command{
	Use:   "watch",
	Short: "Stream service events in real-time (JSONL with --json)",
	Long: `Monitors all services and streams lifecycle events.
Use with --json for JSONL output (one JSON object per line).

Events: starting, alive, crashed, restarting, stopped, health, failed, gave_up`,
	Args: cobra.NoArgs,
	RunE: runWatch,
}

func init() {
	rootCmd.AddCommand(watchCmd)
}

func runWatch(cmd *cobra.Command, _ []string) error {
	mgr, err := loadManager()
	if err != nil {
		return err
	}

	out := newOutput()
	if !jsonMode {
		out.Info("Watching services (Ctrl+C to stop)...")
	}

	// Start watch in background goroutine.
	ctx := cmd.Context()
	go mgr.Watch(ctx)

	// Read events.
	enc := json.NewEncoder(os.Stdout)
	for {
		select {
		case <-ctx.Done():
			return nil
		case event := <-mgr.Events():
			if jsonMode {
				_ = enc.Encode(event)
			} else {
				icon := out.StatusIcon(event.Event)
				msg := fmt.Sprintf("%s %s", event.Service, event.Event)
				if event.Elapsed != "" {
					msg += " (" + event.Elapsed + ")"
				}
				if event.Error != "" {
					msg += " — " + event.Error
				}
				fmt.Printf("  %s %s\n", icon, msg)
			}
		}
	}
}
