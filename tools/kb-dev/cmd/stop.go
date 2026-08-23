package cmd

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

var stopExcept string
var stopDryRun bool

var stopCmd = &cobra.Command{
	Use:   "stop [target]",
	Short: "Stop all services, a group, or a single service",
	Args:  cobra.MaximumNArgs(1),
	RunE:  runStop,
}

func init() {
	stopCmd.Flags().StringVar(&stopExcept, "except", "", "project alias or path to preserve with --all")
	stopCmd.Flags().BoolVar(&stopDryRun, "dry-run", false, "show the stop plan without changing processes")
	rootCmd.AddCommand(stopCmd)
}

func runStop(cmd *cobra.Command, args []string) error {
	if allProjects {
		return runFleetStop(cmd, args)
	}
	if stopExcept != "" || stopDryRun {
		if stopExcept != "" {
			return fmt.Errorf("--except requires --all")
		}
		return fmt.Errorf("--dry-run is supported with --all")
	}
	mgr, err := loadManager()
	if err != nil {
		return err
	}

	target := ""
	if len(args) > 0 {
		target = args[0]
	}

	targets, err := mgr.Config().ResolveTarget(target)
	if err != nil {
		return err
	}

	cascade := ShouldCascade(cmd, false)
	result := mgr.Stop(cmd.Context(), targets, cascade, forceFlag)

	if jsonMode {
		return JSONOut(result)
	}

	out := newOutput()
	for _, a := range result.Actions {
		switch a.Action {
		case "stopped":
			out.OK(a.Service + " stopped")
		case "skipped":
			out.Info(a.Service + " already stopped")
		}
	}

	return nil
}

type fleetStopItem struct {
	Project string `json:"project"`
	Path    string `json:"path"`
	Action  string `json:"action"`
	Error   string `json:"error,omitempty"`
}

type fleetStopResult struct {
	OK       bool            `json:"ok"`
	DryRun   bool            `json:"dryRun"`
	Projects []fleetStopItem `json:"projects"`
}

func runFleetStop(cmd *cobra.Command, args []string) error {
	if projectSelector != "" {
		return fmt.Errorf("--all and --project cannot be combined")
	}
	items, err := loadFleetManagers()
	if err != nil {
		return err
	}
	selector := ""
	if len(args) == 1 {
		selector = args[0]
	}
	cascade := ShouldCascade(cmd, false)
	result := fleetStopResult{OK: true, DryRun: stopDryRun, Projects: make([]fleetStopItem, 0, len(items))}
	for _, item := range items {
		if matchesProjectSelector(item, stopExcept) {
			result.Projects = append(result.Projects, fleetStopItem{Project: item.Alias, Path: item.Path, Action: "preserved"})
			continue
		}
		entry := fleetStopItem{Project: item.Alias, Path: item.Path}
		if item.Mgr == nil {
			entry.Action = "unmanaged"
			entry.Error = item.Error
			result.OK = false
			result.Projects = append(result.Projects, entry)
			continue
		}
		targets, targetErr := item.Mgr.Config().ResolveTarget(selector)
		if targetErr != nil {
			entry.Action = "failed"
			entry.Error = targetErr.Error()
			result.OK = false
			result.Projects = append(result.Projects, entry)
			continue
		}
		if stopDryRun {
			entry.Action = "would_stop"
		} else {
			stopResult := item.Mgr.Stop(cmd.Context(), targets, cascade, forceFlag)
			entry.Action = "stopped"
			if !stopResult.OK {
				entry.Action = "failed"
				entry.Error = stopResult.Hint
				result.OK = false
			}
		}
		result.Projects = append(result.Projects, entry)
	}
	if jsonMode {
		return JSONOut(result)
	}
	for _, item := range result.Projects {
		if item.Error != "" {
			fmt.Printf("  %s: %s\n", item.Project, item.Error)
			continue
		}
		fmt.Printf("  %s: %s\n", item.Project, item.Action)
	}
	if !result.OK {
		return errSilent
	}
	return nil
}

func matchesProjectSelector(item fleetManager, selector string) bool {
	if selector == "" {
		return false
	}
	if selector == item.Alias || selector == item.Path {
		return true
	}
	abs, err := filepath.Abs(selector)
	return err == nil && strings.TrimRight(abs, string(filepath.Separator)) == strings.TrimRight(item.Path, string(filepath.Separator))
}
