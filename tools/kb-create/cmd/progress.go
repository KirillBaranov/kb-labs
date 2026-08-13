package cmd

import (
	"fmt"
	"io"
	"strings"

	"github.com/kb-labs/create/internal/engine/executor"
	engineplan "github.com/kb-labs/create/internal/engine/plan"
	"github.com/kb-labs/create/internal/logger"
	"github.com/kb-labs/create/internal/pm"
)

// failureLogPath is set as soon as a mutating command owns a run log. The
// root renderer uses this exact path on failure; guessing the platform root
// after flag parsing produced missing or stale log links for default installs.
var failureLogPath string

func rememberRunLog(log *logger.Logger) {
	if log != nil {
		failureLogPath = log.LogPath()
	}
}

// logPackageManagerProgress preserves the complete package-manager transcript
// for diagnosis without letting pnpm's unstructured stream redraw the terminal.
func logPackageManagerProgress(log *logger.Logger) func(pm.Progress) {
	return func(event pm.Progress) {
		if log == nil || strings.TrimSpace(event.Line) == "" {
			return
		}
		log.Printf("[package-manager] %s", redactLogLine(event.Line))
	}
}

func redactLogLine(line string) string {
	for _, key := range []string{"NPM_TOKEN", "NODE_AUTH_TOKEN", "KB_LABS_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"} {
		for _, separator := range []string{"=", ":"} {
			prefix := key + separator
			if strings.HasPrefix(strings.TrimSpace(line), prefix) {
				return key + "=[REDACTED]"
			}
		}
	}
	// Registries can echo bearer auth in URLs. Keep the host/path useful but
	// never persist a credential in the diagnostic dossier.
	if at := strings.Index(line, "@"); at > 0 && strings.Contains(line[:at], "://") {
		if scheme := strings.LastIndex(line[:at], "://"); scheme >= 0 {
			return line[:scheme+3] + "[REDACTED]@" + line[at+1:]
		}
	}
	return line
}

// installationProgress reports meaningful milestones only. Package-manager
// output remains in the log, while a long clean install never looks frozen.
func installationProgress(out io.Writer, compiled engineplan.InstallPlan) func(executor.Event) {
	total := 0
	for _, action := range compiled.Actions {
		if action.Kind == engineplan.ActionInstallPackage {
			count := len(actionPackages(action))
			if count == 0 {
				count = 1
			}
			total += count
		}
	}
	seen := make(map[string]struct{}, total)
	completed := 0
	return func(event executor.Event) {
		if total == 0 || event.Status != executor.StatusApplying || !strings.HasPrefix(event.ActionID, "install:") {
			return
		}
		if _, exists := seen[event.ActionID]; exists {
			return
		}
		seen[event.ActionID] = struct{}{}
		for _, action := range compiled.Actions {
			if action.ID == event.ActionID {
				count := len(actionPackages(action))
				if count == 0 {
					count = 1
				}
				completed += count
				break
			}
		}
		if completed == 1 || completed == total || completed%5 == 0 {
			fmt.Fprintf(out, "  Installing packages %d/%d…\n", completed, total)
		}
	}
}
