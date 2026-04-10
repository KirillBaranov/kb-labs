package cmd

import (
	"fmt"
	"sort"
	"strings"

	"github.com/kb-labs/kb-monitor/internal/config"
	"github.com/kb-labs/kb-monitor/internal/monitor"
	"github.com/spf13/cobra"
)

var infraCmd = &cobra.Command{
	Use:   "infra",
	Short: "Show runtime state of infrastructure services",
	Args:  cobra.NoArgs,
	RunE:  runInfraStatus,
}

func init() {
	rootCmd.AddCommand(infraCmd)
}

func runInfraStatus(cmd *cobra.Command, args []string) error {
	cfg, _, err := loadConfig()
	if err != nil {
		return err
	}

	if len(cfg.Infrastructure) == 0 {
		if jsonMode {
			return JSONOut(map[string]any{"ok": true, "services": []any{}})
		}
		fmt.Println("no infrastructure services defined")
		return nil
	}

	names := sortedInfraNames(cfg)
	o := newOutput()
	pool := newClientPool()
	defer pool.closeAll()

	// Group by host for batched SSH calls.
	type group struct {
		sshCfg config.SSHConfig
		names  []string
		svcs   []config.InfraService
	}
	hostOrder := []string{}
	groups := map[string]*group{}
	for _, name := range names {
		svc := cfg.Infrastructure[name]
		key := svc.SSH.User + "@" + svc.SSH.Host
		if _, ok := groups[key]; !ok {
			hostOrder = append(hostOrder, key)
			groups[key] = &group{sshCfg: svc.SSH}
		}
		groups[key].names = append(groups[key].names, name)
		groups[key].svcs = append(groups[key].svcs, svc)
	}

	type infraStatus struct {
		Name    string `json:"name"`
		Image   string `json:"image"`
		State   string `json:"state"`
		Running bool   `json:"running"`
		Error   string `json:"error,omitempty"`
	}

	byName := map[string]infraStatus{}

	for _, key := range hostOrder {
		g := groups[key]
		client, err := pool.getSSH(g.sshCfg)
		if err != nil {
			for _, n := range g.names {
				byName[n] = infraStatus{
					Name:  n,
					Image: cfg.Infrastructure[n].Image,
					State: "unknown",
					Error: err.Error(),
				}
			}
			if !jsonMode {
				o.Err(key + ": " + err.Error())
			}
			continue
		}

		// Batch: one docker inspect per container in one SSH session.
		containers := g.names // infra container name == service name
		statuses, _ := monitor.CheckHealthAll(client, containers)
		for i, n := range g.names {
			state := "unknown"
			if i < len(statuses) {
				state = statuses[i]
			}
			byName[n] = infraStatus{
				Name:    n,
				Image:   g.svcs[i].Image,
				State:   state,
				Running: state == "running",
			}
		}
	}

	results := make([]infraStatus, 0, len(names))
	for _, name := range names {
		s := byName[name]
		results = append(results, s)
		if !jsonMode {
			line := Pad(name, 20) + "  " + s.State
			if s.Image != "" {
				line += "  " + dimImage(s.Image)
			}
			switch s.State {
			case "running":
				o.OK(line)
			case "stopped", "unknown":
				o.Warn(line)
			default:
				o.Err(line)
			}
			if s.Error != "" {
				o.Detail(s.Error)
			}
		}
	}

	if jsonMode {
		return JSONOut(map[string]any{"ok": true, "services": results})
	}
	return nil
}

func sortedInfraNames(cfg *config.Config) []string {
	names := make([]string, 0, len(cfg.Infrastructure))
	for n := range cfg.Infrastructure {
		names = append(names, n)
	}
	sort.Strings(names)
	return names
}

// dimImage shortens a long image name for display (keeps last two segments).
func dimImage(image string) string {
	parts := strings.Split(image, "/")
	if len(parts) > 2 {
		return strings.Join(parts[len(parts)-2:], "/")
	}
	return image
}
