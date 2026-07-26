package cmd

import (
	"path/filepath"

	"github.com/kb-labs/dev/internal/logger"
	"github.com/kb-labs/dev/internal/manager"
	"github.com/spf13/cobra"
)

// DiagnoseResult is an agent-friendly service snapshot. It contains bounded
// tails while ServiceStatus.LogFile points to the complete per-service log.
type DiagnoseResult struct {
	OK       bool                       `json:"ok"`
	Status   *manager.StatusResult      `json:"status"`
	LogDir   string                     `json:"logDir"`
	Services map[string]DiagnoseService `json:"services"`
	Hint     string                     `json:"hint,omitempty"`
}

type DiagnoseService struct {
	LogFile  string   `json:"logFile"`
	LogsTail []string `json:"logsTail,omitempty"`
	LogError string   `json:"logError,omitempty"`
}

var diagnoseCmd = &cobra.Command{
	Use:   "diagnose",
	Short: "Capture bounded service diagnostics",
	Args:  cobra.NoArgs,
	RunE:  runDiagnose,
}

func init() {
	diagnoseCmd.Flags().Int("lines", 200, "number of log lines per service")
	rootCmd.AddCommand(diagnoseCmd)
}

func runDiagnose(cmd *cobra.Command, _ []string) error {
	mgr, err := loadManager()
	if err != nil {
		return err
	}
	lines, _ := cmd.Flags().GetInt("lines")
	if lines < 1 {
		lines = 1
	}

	status := mgr.Status()
	result := &DiagnoseResult{
		OK:       status.OK,
		Status:   status,
		LogDir:   filepath.Dir(firstLogFile(status)),
		Services: make(map[string]DiagnoseService, len(status.Services)),
	}

	for service, serviceStatus := range status.Services {
		logFile := serviceStatus.LogFile
		if logFile == "" {
			result.OK = false
			result.Services[service] = DiagnoseService{LogError: "log file path is unavailable"}
			continue
		}
		tail, tailErr := logger.Tail(filepath.Dir(logFile), service, lines)
		item := DiagnoseService{LogFile: logFile, LogsTail: tail}
		if tailErr != nil {
			item.LogError = tailErr.Error()
			result.OK = false
		}
		result.Services[service] = item
	}

	if !result.OK {
		result.Hint = "Inspect services with failed state and the referenced log files"
	}
	return JSONOut(result)
}

func firstLogFile(status *manager.StatusResult) string {
	for _, service := range status.Services {
		if service.LogFile != "" {
			return service.LogFile
		}
	}
	return ""
}
