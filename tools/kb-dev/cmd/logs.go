package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/kb-labs/dev/internal/logger"
	"github.com/spf13/cobra"
)

var logsCmd = &cobra.Command{
	Use:   "logs [service]",
	Short: "Show service logs",
	Args:  cobra.MaximumNArgs(1),
	RunE:  runLogs,
}

func init() {
	logsCmd.Flags().IntP("lines", "n", 50, "number of lines to show")
	logsCmd.Flags().Bool("all-lines", false, "show the complete log for the selected project")
	logsCmd.Flags().BoolP("follow", "f", false, "follow log output in real-time")
	rootCmd.AddCommand(logsCmd)
}

func runLogs(cmd *cobra.Command, args []string) error {
	if allProjects {
		if len(args) != 1 {
			return fmt.Errorf("logs --all requires a service name")
		}
		follow, _ := cmd.Flags().GetBool("follow")
		if follow {
			return fmt.Errorf("logs --all --follow is not supported; select one project with --project")
		}
		return runFleetLogs(cmd, args[0])
	}
	if len(args) != 1 {
		return fmt.Errorf("logs requires a service name")
	}
	mgr, err := loadManager()
	if err != nil {
		return err
	}
	cfg := mgr.Config()

	svcID := args[0]
	if _, ok := cfg.Services[svcID]; !ok {
		return fmt.Errorf("unknown service: %s", svcID)
	}

	logsDir := filepath.Dir(mgr.LogPath(svcID))

	follow, _ := cmd.Flags().GetBool("follow")
	if follow {
		return logger.Follow(cmd.Context(), logsDir, svcID, os.Stdout)
	}

	lines, _ := cmd.Flags().GetInt("lines")
	all, _ := cmd.Flags().GetBool("all-lines")
	if all {
		lines = 0
	}
	tail, err := logger.Tail(logsDir, svcID, lines)
	if err != nil {
		return err
	}

	if len(tail) == 0 {
		out := newOutput()
		out.Info("no logs for " + svcID)
		return nil
	}

	for _, line := range tail {
		fmt.Println(line)
	}
	return nil
}

type fleetLogItem struct {
	Path  string   `json:"path"`
	Lines []string `json:"lines,omitempty"`
	Error string   `json:"error,omitempty"`
}

type fleetLogsResult struct {
	OK       bool                    `json:"ok"`
	Service  string                  `json:"service"`
	Projects map[string]fleetLogItem `json:"projects"`
}

func runFleetLogs(cmd *cobra.Command, serviceID string) error {
	items, err := loadFleetManagers()
	if err != nil {
		return err
	}
	lines, _ := cmd.Flags().GetInt("lines")
	allLines, _ := cmd.Flags().GetBool("all-lines")
	if allLines {
		lines = 0
	}
	result := fleetLogsResult{OK: true, Service: serviceID, Projects: make(map[string]fleetLogItem, len(items))}
	for _, item := range items {
		entry := fleetLogItem{Path: item.Path, Error: item.Error}
		if item.Mgr == nil {
			result.OK = false
			result.Projects[item.Alias] = entry
			continue
		}
		if _, ok := item.Mgr.Config().Services[serviceID]; !ok {
			entry.Error = "service is not defined in this project"
			result.Projects[item.Alias] = entry
			continue
		}
		entry.Lines, err = logger.Tail(filepath.Dir(item.Mgr.LogPath(serviceID)), serviceID, lines)
		if err != nil {
			entry.Error = err.Error()
			result.OK = false
		}
		result.Projects[item.Alias] = entry
	}
	if jsonMode {
		return JSONOut(result)
	}
	for _, item := range items {
		entry := result.Projects[item.Alias]
		fmt.Printf("\n--- %s (%s) ---\n", item.Alias, entry.Path)
		if entry.Error != "" {
			fmt.Println(entry.Error)
			continue
		}
		for _, line := range entry.Lines {
			fmt.Println(line)
		}
	}
	if !result.OK {
		return errSilent
	}
	return nil
}
