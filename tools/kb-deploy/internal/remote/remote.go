// Package remote is a high-level SSH wrapper that orchestrates kb-create and
// kb-dev on a target host. Every non-trivial SSH interaction in apply goes
// through this package so that the orchestrator can be unit-tested with a
// fake Runner.
package remote

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

// Runner executes shell commands on a host. The SSH-backed implementation
// lives in ssh_runner.go; tests use a FakeRunner.
type Runner interface {
	// Run executes cmd, returning combined stdout+stderr. err is non-nil
	// when the remote process exits non-zero.
	Run(cmd string) (string, error)
	// RunWithInput executes cmd with input fed to its stdin. Used to stream
	// config/secret payloads without exposing them in argv (ps/history).
	RunWithInput(cmd, input string) (string, error)
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
	KeepReleases int               // 0 = install-service default
	// ReleaseID pins the release directory name. The deploy path sets this to
	// the planner's content-aware desired id so the installed dir matches the
	// plan exactly (and install-service does not recompute a spec-only id).
	ReleaseID string
}

// InstallResult is the parsed outcome of install-service on the target.
type InstallResult struct {
	ReleaseID string   // id of the installed (or pre-existing) release
	NoOp      bool     // true if the release was already installed
	Evicted   []string // ids evicted by GC
}

// InstallService runs kb-create install-service on the host and parses its
// machine-readable JSON result. The release-id is read from a structured object
// — never scraped from human-readable text — so wording drift cannot produce an
// empty id that then breaks Swap.
//
// Retry: install-service is idempotent (it no-ops when the release dir already
// exists). If a run exits 0 but yields no JSON result — a rare case where the
// result line was lost over the SSH stream while the install itself succeeded —
// one retry re-runs the same command, which no-ops on the now-present dir and
// returns a clean JSON result. This self-heals the lost-output flake without
// risking a partial install.
func (h *Host) InstallService(opts InstallOpts) (*InstallResult, error) {
	cmd := h.buildInstallCmd(opts)
	var lastOut string
	for attempt := 0; attempt < 2; attempt++ {
		out, err := h.Runner.Run(cmd)
		if err != nil {
			return nil, fmt.Errorf("install-service on %s: %w (output: %s)", h.Name, err, out)
		}
		res, perr := parseInstallJSON(out)
		if perr == nil {
			return res, nil
		}
		lastOut = out // exit 0 but no JSON — retry once (idempotent no-op)
	}
	return nil, fmt.Errorf(
		"install-service on %s: %w (output: %s)", h.Name,
		fmt.Errorf("ERR_INSTALL_NO_RELEASE_ID: no JSON result after retry"), lastOut)
}

func (h *Host) buildInstallCmd(opts InstallOpts) string {
	var b strings.Builder
	b.WriteString("kb-create install-service ")
	b.WriteString(shellQuote(opts.ServicePkg + "@" + opts.Version))
	b.WriteString(" --output json")
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
	if opts.ReleaseID != "" {
		b.WriteString(" --release-id ")
		b.WriteString(shellQuote(opts.ReleaseID))
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

// ServiceID reads the service id from the swapped release's manifest.json at
// services/<short>/current/node_modules/<pkg>/dist/manifest.json.
//
// This id — not the package short name — is the key kb-create writes into
// devservices.yaml (both `kb-create swap` and the canonical `scan` installer
// register services by manifest.id), so it is what kb-dev must be given to
// restart and health-check the service. e.g. "@kb-labs/core-state-daemon"
// installs under services/core-state-daemon/ but its manifest id is
// "state-daemon".
func (h *Host) ServiceID(servicePkg, serviceShort string) (string, error) {
	manifestPath := h.PlatformPath + "/services/" + serviceShort +
		"/current/node_modules/" + servicePkg + "/dist/manifest.json"
	out, err := h.Runner.Run("cat " + shellQuote(manifestPath))
	if err != nil {
		return "", fmt.Errorf("read service manifest on %s: %w (output: %s)", h.Name, err, out)
	}
	var m struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(out), &m); err != nil {
		return "", fmt.Errorf("parse service manifest on %s (%s): %w", h.Name, manifestPath, err)
	}
	if m.ID == "" {
		return "", fmt.Errorf("service manifest on %s (%s) has empty id", h.Name, manifestPath)
	}
	return m.ID, nil
}

// ReconcileDevservices prunes devservices.yaml dependsOn entries that name
// services absent from the registry (external infra like qdrant, or services not
// part of this deployment) so kb-dev's strict validation can load it. Run once
// after every service of a host is installed/swapped and before restarts. The
// returned output lists any pruned dependencies for visibility.
func (h *Host) ReconcileDevservices() (string, error) {
	cmd := "kb-create reconcile-devservices"
	if h.PlatformPath != "" {
		cmd += " --platform " + shellQuote(h.PlatformPath)
	}
	out, err := h.Runner.Run(cmd)
	if err != nil {
		return out, fmt.Errorf("reconcile devservices on %s: %w (output: %s)", h.Name, err, out)
	}
	return out, nil
}

// PackageIntegrity returns the registry-reported content digest of
// servicePkg@version, used to make the release-id content-aware. The query runs
// ON THE HOST (via npm view) because the platform registry is frequently a
// host-local Verdaccio on 127.0.0.1, unreachable from the control machine.
//
// A missing/empty digest is a hard error (ERR_REGISTRY_INTEGRITY): during apply
// the package must already be published, so an empty result means the registry
// is misconfigured or the package is absent — failing fast beats silently
// reverting to a spec-only id that would re-trigger the skip-on-content-change
// bug this guards against.
func (h *Host) PackageIntegrity(servicePkg, version, registry string) (string, error) {
	spec := servicePkg + "@" + version
	cmd := "npm view " + shellQuote(spec) + " dist.integrity --silent"
	if registry != "" {
		cmd += " --registry " + shellQuote(registry)
	}
	out, err := h.Runner.Run(cmd)
	if err != nil {
		return "", fmt.Errorf(
			"ERR_REGISTRY_INTEGRITY: query integrity for %s on %s: %w (output: %s)",
			spec, h.Name, err, out)
	}
	integrity := strings.TrimSpace(out)
	if integrity == "" {
		return "", fmt.Errorf(
			"ERR_REGISTRY_INTEGRITY: registry returned no integrity for %s on %s "+
				"(is it published to %s?)", spec, h.Name, registry)
	}
	return integrity, nil
}

// Swap atomically points current at the given release. env carries the
// deploy.yaml per-service env overrides (already resolved) so kb-create writes
// them into the devservices entry — without this, a service whose deploy config
// moves it off its manifest defaults (e.g. Studio's port) is launched wrong.
func (h *Host) Swap(servicePkg, releaseID string, env map[string]string) error {
	cmd := fmt.Sprintf("kb-create swap %s %s",
		shellQuote(servicePkg), shellQuote(releaseID))
	if h.PlatformPath != "" {
		cmd += " --platform " + shellQuote(h.PlatformPath)
	}
	for _, k := range sortedKeys(env) {
		cmd += " --env " + shellQuote(k+"="+env[k])
	}
	out, err := h.Runner.Run(cmd)
	if err != nil {
		return fmt.Errorf("swap on %s: %w (output: %s)", h.Name, err, out)
	}
	return nil
}

// sortedKeys returns map keys in deterministic order (stable swap commands).
func sortedKeys(m map[string]string) []string {
	if len(m) == 0 {
		return nil
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
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
//
// kb-dev is invoked with --config <platformPath>/.kb/devservices.yaml so it
// reads the file kb-create maintains during swap (ADR-0014 §Target runtime
// contract). This decouples kb-dev from cwd on the target.
func (h *Host) RestartAndWaitHealthy(serviceShort string, timeout time.Duration) error {
	cfgFlag := h.devservicesFlag()
	restart := fmt.Sprintf("kb-dev %srestart %s", cfgFlag, shellQuote(serviceShort))
	if out, err := h.Runner.Run(restart); err != nil {
		return fmt.Errorf("restart %s on %s: %w (output: %s)", serviceShort, h.Name, err, out)
	}
	// kb-dev exposes --json as a global flag and uses exit status to signal
	// readiness; callers only need the boolean outcome, so --json is not set.
	ready := fmt.Sprintf("kb-dev %sready %s --timeout %s",
		cfgFlag, shellQuote(serviceShort), timeout.String())
	out, err := h.Runner.Run(ready)
	if err != nil {
		return fmt.Errorf("health gate %s on %s: %w (output: %s)", serviceShort, h.Name, err, out)
	}
	return nil
}

// devservicesFlag returns "--config <path> " (trailing space) when the host
// has a platformPath configured, or an empty string to fall back to kb-dev's
// default discovery. Prepending it into the command string keeps quoting
// uniform with the other helpers here.
func (h *Host) devservicesFlag() string {
	if h.PlatformPath == "" {
		return ""
	}
	return "--config " + shellQuote(h.PlatformPath+"/.kb/devservices.yaml") + " "
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

// installResultJSON mirrors the object emitted by
// `kb-create install-service --output json`. It is the contract between the two
// tools; do not reconstruct the result from human-readable text.
type installResultJSON struct {
	ReleaseID string   `json:"releaseId"`
	NoOp      bool     `json:"noop"`
	Evicted   []string `json:"evicted"`
}

// parseInstallJSON extracts the structured install result from the host's
// combined stdout+stderr. The Runner merges streams, so pnpm progress (routed to
// stderr by install-service) is interleaved with the single JSON object on
// stdout. We therefore scan lines and pick the one that unmarshals into our shape
// with a non-empty releaseId — a real structured match, not phrase scraping.
//
// A missing or empty release-id is a hard error (ERR_INSTALL_NO_RELEASE_ID): far
// better to fail the action here than to pass an empty id to Swap, which fails
// obscurely with "releaseID is required".
func parseInstallJSON(out string) (*InstallResult, error) {
	var found *installResultJSON
	for _, line := range strings.Split(out, "\n") {
		// Be tolerant of a stray prefix glued onto the JSON line when stdout and
		// stderr are merged over SSH: extract the outermost {...} span and try
		// that. install-service buffers its noise so this should already be a
		// clean line, but the extraction is cheap insurance.
		open := strings.IndexByte(line, '{')
		close := strings.LastIndexByte(line, '}')
		if open < 0 || close <= open {
			continue
		}
		var r installResultJSON
		if err := json.Unmarshal([]byte(line[open:close+1]), &r); err != nil {
			continue // not our object (e.g. a pnpm json-reporter line)
		}
		if r.ReleaseID != "" {
			found = &r // keep the last valid one
		}
	}
	if found == nil {
		return nil, fmt.Errorf(
			"ERR_INSTALL_NO_RELEASE_ID: install-service produced no JSON result with a release id")
	}
	return &InstallResult{
		ReleaseID: found.ReleaseID,
		NoOp:      found.NoOp,
		Evicted:   found.Evicted,
	}, nil
}
