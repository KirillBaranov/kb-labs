package cmd

import (
	"fmt"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/kb-labs/dev/internal/manager"
	"github.com/kb-labs/dev/internal/process"
	"github.com/spf13/cobra"
)

// isSocketURL reports whether an address string is a unix domain socket
// (rendered as "unix:<path>") rather than a TCP URL.
func isSocketURL(url string) bool {
	return strings.HasPrefix(url, "unix:")
}

// shortenSocketAddr renders a socket address compactly for the table by
// eliding the constant /tmp/kb-<hash>/ directory (the same for every service)
// down to an ellipsis. Returns the display string and the elided directory
// (empty for non-socket URLs) so the caller can show it once in a footer.
func shortenSocketAddr(url string) (display, dir string) {
	if !isSocketURL(url) {
		return url, ""
	}
	path := strings.TrimPrefix(url, "unix:")
	return "unix:…/" + filepath.Base(path), filepath.Dir(path) + "/"
}

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
	if allProjects {
		return runFleetStatus()
	}
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

	// socketDir is the constant /tmp/kb-<hash>/ shared by all socket services;
	// captured during rendering and shown once in the footer instead of per row.
	socketDir := ""

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

			addr, dir := shortenSocketAddr(ss.URL)
			if dir != "" {
				socketDir = dir
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

			fmt.Printf("  %s %s%s%s%s\n",
				out.StatusIcon(ss.State),
				Pad(id, 22),
				out.StatusColor(Pad(ss.State, 10)),
				Pad(addr, 0),
				extras,
			)

			if ss.Detail != "" {
				out.Detail(ss.Detail)
			}
		}
	}

	fmt.Println()
	if socketDir != "" {
		fmt.Printf("  %s\n", out.dim.Render("sockets · "+socketDir))
	}
	s := result.Summary
	fmt.Printf("  %s · %s · %s · %s  (%d total)\n",
		out.alive.Render(fmt.Sprintf("%d alive", s.Alive)),
		out.starting.Render(fmt.Sprintf("%d starting", s.Starting)),
		out.failed.Render(fmt.Sprintf("%d failed", s.Failed)),
		out.dead.Render(fmt.Sprintf("%d dead", s.Dead)),
		s.Total,
	)
	fmt.Println()

	return nil
}

type fleetStatus struct {
	OK       bool                         `json:"ok"`
	Projects map[string]fleetProjectState `json:"projects"`
}

type fleetProjectState struct {
	Path      string                `json:"path"`
	Status    *manager.StatusResult `json:"status,omitempty"`
	Resources fleetResourceSummary  `json:"resources,omitempty"`
	Error     string                `json:"error,omitempty"`
}

type fleetResourceSummary struct {
	CPUPercent float64 `json:"cpuPercent"`
	RSSBytes   int64   `json:"rssBytes"`
}

func summarizeResources(status *manager.StatusResult) fleetResourceSummary {
	var summary fleetResourceSummary
	for _, service := range status.Services {
		if service.Resources == nil {
			continue
		}
		summary.RSSBytes += service.Resources.RSS
		cpu := strings.TrimSuffix(service.Resources.CPU, "%")
		if value, err := strconv.ParseFloat(cpu, 64); err == nil {
			summary.CPUPercent += value
		}
	}
	return summary
}

func runFleetStatus() error {
	items, err := loadFleetManagers()
	if err != nil {
		return err
	}
	result := fleetStatus{OK: true, Projects: make(map[string]fleetProjectState, len(items))}
	for _, item := range items {
		state := fleetProjectState{Path: item.Path, Error: item.Error}
		if item.Mgr != nil {
			state.Status = item.Mgr.Status()
			state.Resources = summarizeResources(state.Status)
			if !state.Status.OK {
				result.OK = false
			}
		} else {
			result.OK = false
		}
		result.Projects[item.Alias] = state
	}

	if jsonMode {
		return JSONOut(result)
	}

	out := newOutput()
	fmt.Println()
	fmt.Println(out.label.Render("KB Labs Projects"))
	for _, item := range items {
		if item.Mgr == nil {
			fmt.Printf("  %s %s  %s\n", out.StatusIcon("failed"), Pad(item.Alias, 22), out.failed.Render(item.Error))
			continue
		}
		status := item.Mgr.Status()
		summary := status.Summary
		state := "alive"
		if summary.Alive != summary.Total {
			state = "degraded"
		}
		resources := fleetResourceSummary{}
		if state, ok := result.Projects[item.Alias]; ok {
			resources = state.Resources
		}
		fmt.Printf("  %s %s %s  %d/%d healthy  cpu=%.1f%% rss=%s  %s\n",
			out.StatusIcon(state), Pad(item.Alias, 22), out.StatusColor(Pad(state, 10)),
			summary.Alive, summary.Total, resources.CPUPercent, process.FormatMemory(resources.RSSBytes), out.dim.Render(item.Path))
		for _, anomaly := range status.RuntimeAnomaly {
			out.Detail(fmt.Sprintf("%s: %s (pid %d)", anomaly.State, anomaly.Reason, anomaly.PID))
		}
	}
	fmt.Println()
	if !result.OK {
		return errSilent
	}
	return nil
}
