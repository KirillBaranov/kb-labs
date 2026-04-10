package cmd

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/kb-labs/kb-monitor/internal/monitor"
	"github.com/spf13/cobra"
)

var (
	logsLines  int
	logsFollow bool
)

var logsCmd = &cobra.Command{
	Use:   "logs <target>",
	Short: "Fetch or stream logs for a deployed service",
	Args:  cobra.ExactArgs(1),
	RunE:  runLogs,
}

func init() {
	logsCmd.Flags().IntVar(&logsLines, "lines", 50, "number of log lines to fetch")
	logsCmd.Flags().BoolVar(&logsFollow, "follow", false, "stream logs in real time (incompatible with --json)")
	rootCmd.AddCommand(logsCmd)
}

func runLogs(cmd *cobra.Command, args []string) error {
	if logsFollow && jsonMode {
		return fmt.Errorf("--follow is incompatible with --json")
	}

	cfg, _, err := loadConfig()
	if err != nil {
		return err
	}

	name := args[0]
	t, ok := cfg.Targets[name]
	if !ok {
		return fmt.Errorf("unknown target %q", name)
	}

	if !t.Perms().Logs {
		return fmt.Errorf("logs not permitted for target %q", name)
	}

	client, err := connectTarget(t)
	if err != nil {
		return err
	}
	defer client.Close()

	if logsFollow {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
		go func() {
			<-sig
			cancel()
		}()

		return monitor.StreamLogs(ctx, client, t.Remote.ComposeFile, t.Remote.Service, os.Stdout)
	}

	output, err := monitor.FetchLogs(client, t.Remote.ComposeFile, t.Remote.Service, logsLines)
	if err != nil {
		return err
	}

	if jsonMode {
		return JSONOut(map[string]any{"ok": true, "target": name, "lines": output})
	}

	fmt.Print(output)
	return nil
}
