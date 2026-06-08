package orchestrator

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"

	"github.com/kb-labs/env/internal/env"
)

// kbdevResult mirrors kb-dev's Result JSON (start/stop/ensure).
type kbdevResult struct {
	OK      bool `json:"ok"`
	Actions []struct {
		Service string `json:"service"`
		Action  string `json:"action"`
		Error   string `json:"error,omitempty"`
	} `json:"actions,omitempty"`
	Hint string `json:"hint,omitempty"`
}

// KBDev wraps kb-dev invocations bound to one environment + port base.
type KBDev struct {
	Bin      string
	Config   string
	PortBase int
	Layout   env.Layout
}

func (k KBDev) base() []string {
	args := []string{"--config", k.Config, "--json"}
	if k.PortBase > 0 {
		args = append(args, "--port-base", strconv.Itoa(k.PortBase))
	}
	return args
}

func (k KBDev) run(extraArgs ...string) (kbdevResult, []byte, error) {
	cmd := exec.Command(k.Bin, append(extraArgs, k.base()...)...)
	cmd.Env = k.Layout.ExecEnv(nil)
	out, err := cmd.CombinedOutput()
	var res kbdevResult
	_ = jsonUnmarshal(out, &res) // best-effort; raw returned for diagnostics
	return res, out, err
}

// Start brings the given services up. kb-dev `start` accepts only a single
// target, so a multi-service subset uses `ensure` (idempotent, multi-target).
func (k KBDev) Start(services []string) (kbdevResult, []byte, error) {
	args := append([]string{"ensure"}, services...)
	return k.run(args...)
}

// Ready blocks until the given services are alive (health-gated).
func (k KBDev) Ready(services []string) (kbdevResult, []byte, error) {
	args := append([]string{"ready"}, services...)
	return k.run(args...)
}

// Stop stops all services for this environment.
func (k KBDev) Stop() (kbdevResult, []byte, error) {
	return k.run("stop")
}

// StatusRaw returns kb-dev status --json output for the environment.
func (k KBDev) StatusRaw() ([]byte, error) {
	cmd := exec.Command(k.Bin, "status", "--config", k.Config, "--json")
	cmd.Env = k.Layout.ExecEnv(nil)
	out, err := cmd.CombinedOutput()
	return out, err
}

// failedServices summarizes services that did not start.
func (r kbdevResult) failedServices() string {
	var failed []string
	for _, a := range r.Actions {
		if a.Action == "failed" {
			failed = append(failed, fmt.Sprintf("%s (%s)", a.Service, a.Error))
		}
	}
	return strings.Join(failed, ", ")
}

// ensureConfigExists is a guard with a clear message before invoking kb-dev.
func ensureConfigExists(path string) error {
	if _, err := os.Stat(path); err != nil {
		return fmt.Errorf("devservices.yaml not found at %s (was the platform installed?)", path)
	}
	return nil
}
