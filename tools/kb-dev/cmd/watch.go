package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"

	"github.com/kb-labs/dev/internal/manager"
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
	if allProjects {
		return runFleetWatch(cmd)
	}
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

type fleetWatchEvent struct {
	Project string        `json:"project"`
	Event   manager.Event `json:"event"`
}

func runFleetWatch(cmd *cobra.Command) error {
	items, err := loadFleetManagers()
	if err != nil {
		return err
	}
	out := newOutput()
	if !jsonMode {
		out.Info("Watching all projects (Ctrl+C to stop)...")
	}

	type taggedEvent struct {
		project string
		event   manager.Event
	}
	events := make(chan taggedEvent, 100)
	ctx := cmd.Context()
	var wg sync.WaitGroup
	for _, item := range items {
		if item.Mgr == nil {
			continue
		}
		wg.Add(1)
		go func(item fleetManager) {
			defer wg.Done()
			go item.Mgr.Watch(ctx)
			for {
				select {
				case <-ctx.Done():
					return
				case event := <-item.Mgr.Events():
					events <- taggedEvent{project: item.Alias, event: event}
				}
			}
		}(item)
	}
	go func() {
		wg.Wait()
		close(events)
	}()

	enc := json.NewEncoder(os.Stdout)
	for tagged := range events {
		if jsonMode {
			_ = enc.Encode(fleetWatchEvent{Project: tagged.project, Event: tagged.event})
			continue
		}
		icon := out.StatusIcon(tagged.event.Event)
		msg := fmt.Sprintf("%s %s", tagged.project, tagged.event.Service)
		msg += " " + tagged.event.Event
		if tagged.event.Elapsed != "" {
			msg += " (" + tagged.event.Elapsed + ")"
		}
		if tagged.event.Error != "" {
			msg += " — " + tagged.event.Error
		}
		fmt.Printf("  %s %s\n", icon, msg)
	}
	return nil
}
