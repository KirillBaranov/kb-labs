package orchestrator

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/kb-labs/clikit/diag"
	"github.com/kb-labs/env/internal/env"
)

// EnsureScenario applies a scenario.yaml (overlay + restarts) to the live env.
func (k KBDev) EnsureScenario(scenarioPath string) (kbdevResult, []byte, error) {
	return k.run("ensure", "--scenario", scenarioPath)
}

// ApplyConfig hot-swaps the env's config overlay: it copies the overlay into the
// environment, writes a scenario.yaml that references it and restarts the given
// services, then runs `kb-dev ensure --scenario`. No reinstall — the platform
// re-reads the overlay on restart.
func ApplyConfig(l env.Layout, k KBDev, overlayAbs string, services []string) error {
	if _, err := os.Stat(overlayAbs); err != nil {
		return diag.New("ERR_OVERLAY_NOT_FOUND", "config overlay not found",
			diag.WithReason(overlayAbs),
			diag.WithHint("check the profile's `config:` path"))
	}

	base := filepath.Base(overlayAbs)
	if err := copyFile(overlayAbs, filepath.Join(l.Logs, base)); err != nil {
		return fmt.Errorf("copy overlay: %w", err)
	}

	var b strings.Builder
	b.WriteString("name: kbenv\noverlays:\n  - " + base + "\nrestarts:\n")
	for _, s := range services {
		b.WriteString("  - " + s + "\n")
	}
	scenPath := filepath.Join(l.Logs, "scenario.yaml")
	if err := os.WriteFile(scenPath, []byte(b.String()), 0o600); err != nil {
		return err
	}

	res, out, err := k.EnsureScenario(scenPath)
	if err != nil || !res.OK {
		return diag.New("ERR_CONFIG_APPLY_FAILED", "applying config overlay failed",
			diag.WithReason(strings.TrimSpace(string(out))))
	}
	return nil
}
