package cmd

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/kb-labs/create/internal/logger"
)

var logsCmd = &cobra.Command{
	Use:   "logs",
	Short: "Show install logs",
	Long: `Show the most recent installation log.
Use --follow to stream new lines in real time.`,
	RunE: runLogs,
}

var flagFollow bool

func init() {
	rootCmd.AddCommand(logsCmd)
	logsCmd.Flags().BoolVarP(&flagFollow, "follow", "f", false, "follow log output (like tail -f)")
}

func runLogs(cmd *cobra.Command, args []string) error {
	out := newOutput()

	platformDir, err := resolvePlatformDir(cmd)
	if err != nil {
		return err
	}

	logPath := logger.LatestLogPath(platformDir)
	if logPath == "" {
		return fmt.Errorf("no install logs found in %s", platformDir)
	}
	out.Info("Reading log: " + logPath)

	// #nosec G304 -- logPath is derived from platformDir/.kb/logs and selected internally.
	f, err := os.Open(logPath)
	if err != nil {
		return fmt.Errorf("open log: %w", err)
	}
	defer func() { _ = f.Close() }()

	// Print existing content.
	if _, err := io.Copy(os.Stdout, f); err != nil {
		return err
	}

	if !flagFollow {
		return nil
	}
	out.Info("Follow mode enabled (Ctrl+C to stop)")
	fmt.Println()

	// Follow mode: poll for new content.
	for {
		time.Sleep(300 * time.Millisecond)
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			fmt.Println(scanner.Text())
		}
	}
}
