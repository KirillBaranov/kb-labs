package cmd

import (
	"fmt"
	"strings"

	"github.com/kb-labs/kb-monitor/internal/monitor"
	"github.com/spf13/cobra"
)

var execCmd = &cobra.Command{
	Use:   "exec <target> -- <cmd...>",
	Short: "Execute a command inside a container",
	Long: `Execute a command inside the running container for a target.

Requires exec: true in the target's permissions block.

Example:
  kb-monitor exec kb-labs-web -- df -h
  kb-monitor exec kb-labs-web -- env`,
	Args: cobra.MinimumNArgs(1),
	RunE: runExec,
}

func init() {
	rootCmd.AddCommand(execCmd)
}

func runExec(cmd *cobra.Command, args []string) error {
	cfg, _, err := loadConfig()
	if err != nil {
		return err
	}

	name := args[0]
	t, ok := cfg.Targets[name]
	if !ok {
		return fmt.Errorf("unknown target %q", name)
	}

	if !t.Perms().Exec {
		return fmt.Errorf("exec is disabled for target %q", name)
	}

	// Everything after -- is the remote command.
	remoteArgs := args[1:]
	if len(remoteArgs) == 0 {
		return fmt.Errorf("no command specified — use: kb-monitor exec %s -- <cmd>", name)
	}
	remoteCmd := strings.Join(remoteArgs, " ")

	client, err := connectTarget(t)
	if err != nil {
		return err
	}
	defer client.Close()

	out, err := monitor.ExecContainer(client, t.Remote.ComposeFile, t.Remote.Service, remoteCmd)
	if err != nil {
		if jsonMode {
			return JSONOut(map[string]any{"ok": false, "target": name, "hint": err.Error(), "output": out})
		}
		return err
	}

	if jsonMode {
		return JSONOut(map[string]any{"ok": true, "target": name, "output": out})
	}

	fmt.Print(out)
	return nil
}
