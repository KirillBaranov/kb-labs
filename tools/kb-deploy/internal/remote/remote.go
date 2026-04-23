// Package remote is a high-level SSH wrapper that orchestrates kb-create and
// kb-dev on a target host. Every non-trivial SSH interaction in apply goes
// through this package so that the orchestrator can be unit-tested with a
// fake Runner.
package remote

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// Runner executes shell commands on a host. The SSH-backed implementation
// lives in ssh_runner.go; tests use a FakeRunner.
type Runner interface {
	// Run executes cmd, returning combined stdout+stderr. err is non-nil
	// when the remote process exits non-zero.
	Run(cmd string) (string, error)
}

// Host ties a Runner to the platform layout on that target.
type Host struct {
	Name         string
	Runner       Runner
	PlatformPath string // e.g. ~/kb-platform or /opt/kb-platform
}

// InstallOpts mirrors what kb-create install-service expects.
type InstallOpts struct {
	ServicePkg   string            // "@kb-labs/gateway"
	Version      string            // "1.2.3"
	Adapters     map[string]string // role → npm spec (with version)
	Plugins      map[string]string // package → version
	Registry     string            // optional
	KeepReleases int               // default 3
}

// InstallResult is the parsed outcome of install-service on the target.
type InstallResult struct {
	ReleaseID string   // id of the installed (or pre-existing) release
	NoOp      bool     // true if the release was already installed
	Evicted   []string // ids evicted by GC
}

// InstallService runs kb-create install-service on the host.
func (h *Host) InstallService(opts InstallOpts) (*InstallResult, error) {
	cmd := h.buildInstallCmd(opts)
	out, err := h.Runner.Run(cmd)
	if err != nil {
		return nil, fmt.Errorf("install-service on %s: %w (output: %s)", h.Name, err, out)
	}
	return parseInstallOutput(out), nil
}

func (h *Host) buildInstallCmd(opts InstallOpts) string {
	var b strings.Builder
	b.WriteString("kb-create install-service ")
	b.WriteString(shellQuote(opts.ServicePkg + "@" + opts.Version))
	if h.PlatformPath != "" {
		b.WriteString(" --platform ")
		b.WriteString(shellQuote(h.PlatformPath))
	}
	if opts.Registry != "" {
		b.WriteString(" --registry ")
		b.WriteString(shellQuote(opts.Registry))
	}
	if opts.KeepReleases > 0 {
		b.WriteString(fmt.Sprintf(" --keep-releases %d", opts.KeepReleases))
	}
	if len(opts.Adapters) > 0 {
		b.WriteString(" --adapters ")
		b.WriteString(shellQuote(joinAdapters(opts.Adapters)))
	}
	if len(opts.Plugins) > 0 {
		b.WriteString(" --plugins ")
		b.WriteString(shellQuote(joinPlugins(opts.Plugins)))
	}
	return b.String()
}

// Swap atomically points current at the given release.
func (h *Host) Swap(servicePkg, releaseID string) error {
	cmd := fmt.Sprintf("kb-create swap %s %s",
		shellQuote(servicePkg), shellQuote(releaseID))
	if h.PlatformPath != "" {
		cmd += " --platform " + shellQuote(h.PlatformPath)
	}
	out, err := h.Runner.Run(cmd)
	if err != nil {
		return fmt.Errorf("swap on %s: %w (output: %s)", h.Name, err, out)
	}
	return nil
}

// Rollback swaps current back to previous on the target.
func (h *Host) Rollback(servicePkg string) error {
	cmd := fmt.Sprintf("kb-create rollback %s", shellQuote(servicePkg))
	if h.PlatformPath != "" {
		cmd += " --platform " + shellQuote(h.PlatformPath)
	}
	out, err := h.Runner.Run(cmd)
	if err != nil {
		return fmt.Errorf("rollback on %s: %w (output: %s)", h.Name, err, out)
	}
	return nil
}

// CurrentReleases returns the current/previous map for all services installed
// on the host (via kb-create releases --json).
func (h *Host) CurrentReleases() (*ReleasesReport, error) {
	cmd := "kb-create releases --json"
	if h.PlatformPath != "" {
		cmd += " --platform " + shellQuote(h.PlatformPath)
	}
	out, err := h.Runner.Run(cmd)
	if err != nil {
		// Empty platform without any releases is a normal startup state.
		// kb-create exits 0 for that, so any error here is real.
		return nil, fmt.Errorf("list releases on %s: %w (output: %s)", h.Name, err, out)
	}
	rep := &ReleasesReport{}
	if err := json.Unmarshal([]byte(out), rep); err != nil {
		return nil, fmt.Errorf("parse releases output on %s: %w", h.Name, err)
	}
	return rep, nil
}

// ReleasesReport mirrors the JSON shape emitted by `kb-create releases --json`.
type ReleasesReport struct {
	Current  map[string]string            `json:"current"`
	Previous map[string]string            `json:"previous"`
	Releases map[string][]ReleaseListItem `json:"releases"`
}

// ReleaseListItem is one entry in the releases.releases[<service>] array.
type ReleaseListItem struct {
	ID        string `json:"id"`
	Version   string `json:"version"`
	CreatedAt string `json:"createdAt"`
}

// RestartAndWaitHealthy asks kb-dev to restart the service and waits until
// its health probe succeeds. Returns the error from kb-dev ready if the
// service does not become healthy within timeout.
func (h *Host) RestartAndWaitHealthy(serviceShort string, timeout time.Duration) error {
	restart := fmt.Sprintf("kb-dev restart %s", shellQuote(serviceShort))
	if out, err := h.Runner.Run(restart); err != nil {
		return fmt.Errorf("restart %s on %s: %w (output: %s)", serviceShort, h.Name, err, out)
	}
	ready := fmt.Sprintf("kb-dev ready %s --timeout %s --output json",
		shellQuote(serviceShort), timeout.String())
	out, err := h.Runner.Run(ready)
	if err != nil {
		return fmt.Errorf("health gate %s on %s: %w (output: %s)", serviceShort, h.Name, err, out)
	}
	return nil
}

// --- helpers ----------------------------------------------------------------

// shellQuote wraps s in single quotes and escapes any embedded single quotes.
// Safe for bash/sh argument passing.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
}

// joinAdapters encodes "role=spec,role=spec" for --adapters.
func joinAdapters(m map[string]string) string {
	parts := make([]string, 0, len(m))
	for role, spec := range m {
		parts = append(parts, role+"="+spec)
	}
	return strings.Join(parts, ",")
}

// joinPlugins encodes "pkg@ver,pkg@ver" for --plugins.
func joinPlugins(m map[string]string) string {
	parts := make([]string, 0, len(m))
	for pkg, ver := range m {
		parts = append(parts, pkg+"@"+ver)
	}
	return strings.Join(parts, ",")
}

// parseInstallOutput reads the human-friendly lines emitted by
// `kb-create install-service` to reconstruct the result.
//
// The command prints either:
//   release <id> already installed (no-op)
// or:
//   installed release <id> at <path>
//     evicted: <id>
//     evicted: <id>
func parseInstallOutput(out string) *InstallResult {
	r := &InstallResult{}
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		line = strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(line, "release ") && strings.Contains(line, "already installed"):
			r.NoOp = true
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				r.ReleaseID = fields[1]
			}
		case strings.HasPrefix(line, "installed release "):
			fields := strings.Fields(line)
			if len(fields) >= 3 {
				r.ReleaseID = fields[2]
			}
		case strings.HasPrefix(line, "evicted:"):
			id := strings.TrimSpace(strings.TrimPrefix(line, "evicted:"))
			if id != "" {
				r.Evicted = append(r.Evicted, id)
			}
		}
	}
	return r
}
