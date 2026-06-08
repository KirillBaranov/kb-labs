package cmd

import (
	"fmt"
	"path/filepath"
	"strings"

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
