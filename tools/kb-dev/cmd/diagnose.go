package cmd

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/kb-labs/dev/internal/logger"
	"github.com/kb-labs/dev/internal/manager"
	"github.com/spf13/cobra"
)

// DiagnoseResult is an agent-friendly service snapshot. It contains bounded
// tails while ServiceStatus.LogFile points to the complete per-service log.
type DiagnoseResult struct {
	OK       bool                       `json:"ok"`
	Status   *manager.StatusResult      `json:"status"`
	Config   DiagnoseConfig             `json:"config"`
	LogDir   string                     `json:"logDir"`
	Services map[string]DiagnoseService `json:"services"`
	Hint     string                     `json:"hint,omitempty"`
}

// DiagnoseConfig describes the effective service and runtime configuration
// without exposing credentials. Raw config files remain in the CI dossier
// only when a caller explicitly captures them through the collector.
type DiagnoseConfig struct {
	RootDir          string         `json:"rootDir"`
	ProjectDir       string         `json:"projectDir"`
	Resolved         map[string]any `json:"resolved"`
	RuntimeFiles     map[string]any `json:"runtimeFiles,omitempty"`
	RuntimeFilePaths []string       `json:"runtimeFilePaths,omitempty"`
}

type DiagnoseService struct {
	LogFile  string   `json:"logFile"`
	LogsTail []string `json:"logsTail,omitempty"`
	LogError string   `json:"logError,omitempty"`
}

var diagnosticSecretPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,;]+`),
	regexp.MustCompile(`(?i)((?:password|passwd|secret|token|api[_-]?key|client[_-]?secret)\s*[:=]\s*)[^\s,;]+`),
	regexp.MustCompile(`(?i)(https?://[^\s/@]+):[^\s/@]+@`),
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
	configSnapshot := sanitizedConfig(mgr.Config())
	result := &DiagnoseResult{
		OK:     status.OK && status.Summary.Total > 0 && status.Summary.Alive == status.Summary.Total,
		Status: status,
		Config: DiagnoseConfig{
			RootDir:    mgr.RootDir(),
			ProjectDir: mgr.ProjectDir(),
			Resolved:   configSnapshot,
		},
		LogDir:   filepath.Dir(firstLogFile(status)),
		Services: make(map[string]DiagnoseService, len(status.Services)),
	}
	result.Config.RuntimeFiles, result.Config.RuntimeFilePaths = readRuntimeFiles(mgr.ProjectDir(), mgr.RootDir())

	for service, serviceStatus := range status.Services {
		logFile := serviceStatus.LogFile
		if logFile == "" {
			result.OK = false
			result.Services[service] = DiagnoseService{LogError: "log file path is unavailable"}
			continue
		}
		tail, tailErr := logger.Tail(filepath.Dir(logFile), service, lines)
		item := DiagnoseService{LogFile: logFile, LogsTail: redactDiagnosticLines(tail)}
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

func sanitizedConfig(value any) map[string]any {
	data, err := json.Marshal(value)
	if err != nil {
		return map[string]any{"error": "unable to serialize resolved config"}
	}
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return map[string]any{"error": "unable to decode resolved config"}
	}
	return sanitizeConfigMap(raw)
}

func sanitizeConfigMap(raw map[string]any) map[string]any {
	result := make(map[string]any, len(raw))
	for key, value := range raw {
		result[key] = sanitizeConfigValue(key, value)
	}
	return result
}

func sanitizeConfigValue(key string, value any) any {
	if isSensitiveConfigKey(key) {
		return "[REDACTED]"
	}
	switch typed := value.(type) {
	case map[string]any:
		return sanitizeConfigMap(typed)
	case []any:
		out := make([]any, len(typed))
		for i, item := range typed {
			out[i] = sanitizeConfigValue(key, item)
		}
		return out
	case string:
		return redactDiagnosticLines([]string{typed})[0]
	default:
		return value
	}
}

func isSensitiveConfigKey(key string) bool {
	key = strings.ToLower(key)
	return strings.Contains(key, "password") || strings.Contains(key, "secret") ||
		strings.Contains(key, "token") || strings.Contains(key, "api_key") ||
		strings.Contains(key, "apikey") || strings.Contains(key, "private_key") ||
		strings.Contains(key, "client_secret")
}

var runtimeConfigCommentPattern = regexp.MustCompile(`(?m)^[ \t]*//[^\n]*\n?`)
var runtimeConfigTrailingCommaPattern = regexp.MustCompile(`,(\s*[}\]])`)

func readRuntimeFiles(projectDir, rootDir string) (map[string]any, []string) {
	paths := []string{
		filepath.Join(projectDir, ".kb", "kb.config.jsonc"),
		filepath.Join(projectDir, ".kb", "kb.config.json"),
		filepath.Join(projectDir, ".kb", "marketplace.lock"),
		filepath.Join(rootDir, ".kb", "kb.config.jsonc"),
		filepath.Join(rootDir, ".kb", "kb.config.json"),
		filepath.Join(rootDir, ".kb", "marketplace.lock"),
	}
	configs := make(map[string]any)
	seen := make(map[string]struct{})
	var found []string
	for _, path := range paths {
		if _, ok := seen[path]; ok {
			continue
		}
		seen[path] = struct{}{}
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		clean := runtimeConfigCommentPattern.ReplaceAllString(string(data), "")
		clean = runtimeConfigTrailingCommaPattern.ReplaceAllString(clean, "$1")
		var parsed map[string]any
		if err := json.Unmarshal([]byte(strings.TrimSpace(clean)), &parsed); err != nil {
			configs[path] = map[string]any{"error": "runtime config is not valid JSONC"}
		} else {
			configs[path] = sanitizeConfigMap(parsed)
		}
		found = append(found, path)
	}
	return configs, found
}

func redactDiagnosticLines(lines []string) []string {
	redacted := make([]string, len(lines))
	for i, line := range lines {
		redacted[i] = line
		for _, pattern := range diagnosticSecretPatterns {
			redacted[i] = pattern.ReplaceAllString(redacted[i], `$1[REDACTED]`)
		}
	}
	return redacted
}

func firstLogFile(status *manager.StatusResult) string {
	for _, service := range status.Services {
		if service.LogFile != "" {
			return service.LogFile
		}
	}
	return ""
}
