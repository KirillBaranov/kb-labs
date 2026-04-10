package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/kb-labs/dev/internal/config"
	"github.com/kb-labs/dev/internal/logger"
	"github.com/spf13/cobra"
)

var logsCmd = &cobra.Command{
	Use:   "logs <service>",
	Short: "Show service logs",
	Args:  cobra.ExactArgs(1),
	RunE:  runLogs,
}

func init() {
	logsCmd.Flags().IntP("lines", "n", 50, "number of lines to show")
	logsCmd.Flags().BoolP("follow", "f", false, "follow log output in real-time")
	rootCmd.AddCommand(logsCmd)
}

func runLogs(cmd *cobra.Command, args []string) error {
	cfgPath, err := FindConfigPath()
	if err != nil {
		return err
	}
	rootDir := config.RootDir(cfgPath)

	// Minimal config read for logsDir.
	cfg, err := loadConfig(cfgPath)
	if err != nil {
		return err
	}

	svcID := args[0]
	if _, ok := cfg.Services[svcID]; !ok {
		return fmt.Errorf("unknown service: %s", svcID)
	}

	logsDir := filepath.Join(rootDir, cfg.Settings.LogsDir)

	follow, _ := cmd.Flags().GetBool("follow")
	if follow {
		return logger.Follow(cmd.Context(), logsDir, svcID, os.Stdout)
	}

	lines, _ := cmd.Flags().GetInt("lines")
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
