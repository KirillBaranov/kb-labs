// Package installer holds the types and repair utilities shared by the
// declarative engine's callers (cmd/doctor.go, cmd/rollback.go,
// internal/wizard) and the platform's `kb-create` binary/CLI symlink
// installation primitives.
//
// This package used to also own platform installation and config rendering
// (FinalizeDeclarative, Install, Diff, Update — the "legacy renderer" path).
// That responsibility now belongs entirely to the declarative engine
// (internal/engine/plan.Compile + internal/engine/runtime.Apply +
// internal/engine/handlers, notably discoveryHandler and binaryHandler,
// which duplicate what installBinaries/symlinkCLI below do for the
// install/update path — kept here only because cmd/doctor.go's `doctor --fix`
// and cmd/rollback.go's recovery path call them directly, independent of any
// InstallPlan). See docs/plans/2026-08-19-kb-create-engine-unification-implementation.md.
package installer

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/kb-labs/create/internal/bindown"
	"github.com/kb-labs/create/internal/config"
	"github.com/kb-labs/create/internal/detect"
	"github.com/kb-labs/create/internal/gateway"
	"github.com/kb-labs/create/internal/logger"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/platform"
	"github.com/kb-labs/create/internal/pm"
	"github.com/kb-labs/create/internal/scan"
	"github.com/kb-labs/create/internal/types"
)

// Selection holds what the user chose to install. Still used by
// internal/wizard (the --dev-manifest interactive picker) and cmd/continue.go
// as a plain data-transfer type — no code in this package materializes an
// install from it anymore; the declarative engine does that from an
// InstallRequest instead.
type Selection struct {
	PlatformDir                      string
	ProjectCWD                       string
	Services                         []string // component IDs
	Plugins                          []string // component IDs
	Binaries                         []string // binary IDs to install
	Telemetry                        config.TelemetryConfig
	Project                          *detect.ProjectProfile // detected project info (may be nil)
	DemoMode                         bool
	DevMode                          bool   // true when --dev-manifest flag is set; enables pnpm pack pre-step
	Registry                         string // optional: custom npm registry URL (e.g. http://localhost:4873)
	Consent                          types.ConsentChoice
	APIKey                           string `json:"-"` // only when Consent == types.ConsentOwnKey // #nosec G117 -- not serialized
	TelemetryEnabled                 bool
	LLMEnabled                       bool   // user explicitly opted in to LLM via wizard or --llm flag
	LLMProvider                      string // "openai" | "anthropic" | "" (skip)
	LLMKey                           string `json:"-"` // API key for the chosen provider // #nosec G117
	LocalMode                        bool   // user chose local single-user mode (gateway auth off, loopback bind)
	AllowIncompatibleLegacyMigration bool
	// ClaudeEnabled controls the optional KB Labs agent setup: managed skills
	// under .claude/skills/kb-labs-* plus a separately marked CLAUDE.md section.
	// It never authorizes replacing user-authored files.
	ClaudeEnabled bool
	// SkipClaudeMd keeps the skills-only option available to the CLI flag while
	// preserving user-owned CLAUDE.md content.
	SkipClaudeMd bool
	// Adapters overrides which package backs a given capability role (e.g.
	// "cache" -> "@kb-labs/adapters-redis@0.2.0"), from the chosen intent's
	// bundle or the custom picker's adapter-role opt-ins.
	Adapters map[string]string
	// EnvValues are extra secret-shaped values collected by an intent's
	// "envVar" wizard step (e.g. {"NPM_TOKEN": "..."}), written to .env the
	// same way as LLMKey.
	EnvValues map[string]string `json:"-"` // #nosec G117 -- not serialized
	// Intent is the chosen wizard intent's ID (e.g. "release", "explore"),
	// used post-install to print that intent's docs/next-steps. Empty when
	// the selection didn't come from the intent-driven wizard (e.g. a future
	// direct API caller).
	Intent string
	// FirstCommand is copied from the selected intent's outcome contract. It
	// gives post-install code one stable, safe command to hand back to the
	// user instead of deriving it from generic help text.
	FirstCommand *manifest.FirstCommand
	// PendingInput describes a valid install whose first command needs user
	// input (for example, a commit plan on a clean repository). It is not an
	// installation error and is persisted for `kb-create continue`.
	PendingInput string
	// CustomCommandName and CustomCommandDescription form the user-approved
	// contract for the custom-plugin path. They are plain product intent, not
	// credentials or prompt content.
	CustomCommandName        string
	CustomCommandDescription string
	// PluginVersions/ServiceVersions override the installed version for a
	// specific component ID (e.g. `--plugins=release@0.2.0`), keyed by that
	// ID. Separate maps because a service and a plugin can share the same
	// catalog ID (e.g. "marketplace" is both) with independently pinned
	// versions. Absent/empty entries fall back to Component.PackageSpec()'s
	// normal @latest (or @file:path in dev mode) resolution.
	PluginVersions  map[string]string
	ServiceVersions map[string]string
}

// Result carries post-install display data for cmd/output.go's completion
// summary. Populated by cmd/create.go/cmd/install.go directly from the
// compiled InstallPlan now — no longer returned by a method in this package.
type Result struct {
	PlatformDir string
	ProjectCWD  string
	ConfigPath  string
	Duration    time.Duration

	// InstalledBinaries lists Go binaries (e.g. "kb-dev") that were
	// successfully installed into the platform bin dir. Consumers use this
	// to decide which onboarding commands to suggest — an empty list means
	// the service manager is not available, so "kb-dev start" must not be
	// printed as a next step.
	InstalledBinaries []string
	// HasServices is true if the manifest declared at least one runnable
	// service. Together with InstalledBinaries this is enough to decide
	// whether "start services" makes sense as a next step.
	HasServices bool
	// ServicesWarning is set when the caller wants to surface a prominent
	// warning about service discovery — see printNextSteps in cmd/create.go.
	ServicesWarning string
	// Gateway is the discovery-derived gateway plan, when the caller has one
	// to display. nil if not applicable.
	Gateway *gateway.Plan
	// InstalledPlugins lists the plugins a manifest scan found, for callers
	// that want to inspect their static manifest data (e.g. `kb-create
	// install` prints env-var hints from each plugin's dist/manifest.json).
	InstalledPlugins []scan.PluginEntry
}

// UpdateDiff describes changes between the installed manifest and the current one.
type UpdateDiff struct {
	Updated []string // packages with version changes
	Added   []string // new packages
	Removed []string // removed packages
}

// HasChanges returns true if there is anything to update.
func (d *UpdateDiff) HasChanges() bool {
	return len(d.Updated)+len(d.Added)+len(d.Removed) > 0
}

// UpdateResult carries post-update display data, same role as Result.
type UpdateResult struct {
	Diff     *UpdateDiff
	Duration time.Duration
	Gateway  *gateway.Plan
}

// Installer's remaining live surface is repair.go's RepairCLI/RepairBinaries/
// RepairNodeModules/RepairPATH (doctor --fix, rollback) — everything that
// once drove a full install/update lives in the declarative engine instead.
type Installer struct {
	PM      pm.PackageManager
	Log     *logger.Logger
	Version string                               // kb-create version, e.g. "1.4.2" (used for provenance)
	OnStep  func(step, total int, label string) // called at each named stage
	OnLine  func(line string)                   // called for each raw output line from pm
}

// ── helpers used by repair.go ───────────────────────────────────────────────

// symlinkCLI creates a platform-appropriate launcher for the KB CLI.
// On Unix: shell script at ~/.local/bin/kb
// On Windows: batch file at %LOCALAPPDATA%\kb-labs\bin\kb.cmd.
func (ins *Installer) symlinkCLI(platformDir string) {
	binJS := filepath.Join(platformDir, "node_modules", "@kb-labs", "cli-bin", "dist", "bin.js")
	if _, err := os.Stat(binJS); err != nil {
		ins.Log.Printf("  [WARN] kb bin.js not found at %s", binJS)
		return
	}

	binDir, err := platform.UserBinDir()
	if err != nil {
		ins.Log.Printf("  [WARN] resolve bin dir: %v", err)
		return
	}

	res, err := platform.WriteCLIWrapper(binDir, binJS)
	if err != nil {
		ins.Log.Printf("  [WARN] write kb wrapper: %v", err)
		return
	}
	ins.Log.Printf("  %s → %s", binJS, res.Path)
	if res.Replaced {
		ins.Log.Printf("  [WARN] replaced existing kb wrapper (was pointing at %s)", res.PreviousTarget)
	}

	result := platform.EnsureInPATH(binDir)
	switch {
	case result.AlreadySet:
		// nothing to report
	case result.NeedRestart && result.HintCmd != "":
		ins.Log.Printf("  [PATH] Run to activate: %s", result.HintCmd)
	}
	if repaired, repairErr := platform.RepairLegacyKBAliases(); repairErr != nil {
		ins.Log.Printf("  [WARN] repair legacy kb shell aliases: %v", repairErr)
	} else {
		for _, path := range repaired {
			ins.Log.Printf("  [SHELL] removed legacy kb alias from %s", path)
		}
	}
}

// filterBinaries returns only the binaries whose ID is in the selected list.
// If selected is nil or empty, all binaries are returned (backwards compat).
func filterBinaries(bins []manifest.Binary, selected []string) []manifest.Binary {
	if len(selected) == 0 {
		return bins
	}
	set := make(map[string]bool, len(selected))
	for _, id := range selected {
		set[id] = true
	}
	var out []manifest.Binary
	for _, b := range bins {
		if set[b.ID] {
			out = append(out, b)
		}
	}
	return out
}

// installBinaries downloads Go binaries from GitHub Releases into <platformDir>/bin/
// and symlinks them into ~/.local/bin/ for PATH availability. The returned
// slice contains the names of binaries that were successfully installed
// AND also made it into the user bin dir — so callers can safely use it to
// decide which follow-up commands (e.g. "kb-dev start") to suggest.
func (ins *Installer) installBinaries(platformDir string, bins []manifest.Binary) ([]string, error) {
	binDir := filepath.Join(platformDir, "bin")
	installed := make([]string, 0, len(bins))

	for _, b := range bins {
		userBinDir, err := platform.UserBinDir()
		if err != nil {
			ins.Log.Printf("  [WARN] resolve bin dir: %v", err)
			continue
		}

		// Dev mode: copy from local path instead of downloading from GitHub.
		if b.LocalPath != "" {
			ins.Log.Printf("  %s: local %s", b.Name, b.LocalPath)
			copyRes, copyErr := platform.CopyBinary(b.LocalPath, binDir, b.Name)
			if copyErr != nil {
				return installed, fmt.Errorf("binary %s (local): %w", b.Name, copyErr)
			}
			ins.Log.Printf("  %s → %s", b.LocalPath, copyRes.Path)
			copyRes2, copyErr2 := platform.CopyBinary(copyRes.Path, userBinDir, b.Name)
			if copyErr2 != nil {
				ins.Log.Printf("  [WARN] install %s → %s: %v", b.Name, userBinDir, copyErr2)
			} else {
				ins.Log.Printf("  %s → %s", copyRes.Path, copyRes2.Path)
				installed = append(installed, b.Name)
			}
			continue
		}

		// Prod mode: download from GitHub Releases.
		ch := make(chan bindown.Progress, 8)
		done := make(chan struct{})
		go func() {
			defer close(done)
			for p := range ch {
				msg := fmt.Sprintf("%s: %s", p.Binary, p.Status)
				ins.Log.Printf("  %s", msg)
				if ins.OnLine != nil {
					ins.OnLine(msg)
				}
			}
		}()

		var result *bindown.Result
		var dlErr error
		if b.Version != "" {
			result, dlErr = bindown.DownloadVersion(b.Repo, b.Name, b.Version, binDir, ch)
		} else {
			// Compatibility fallback for the embedded manifest only. Published
			// manifests pin Version and therefore never query GitHub API.
			result, dlErr = bindown.Download(b.Repo, b.Name, binDir, ch)
		}
		close(ch)
		<-done

		if dlErr != nil {
			return installed, fmt.Errorf("binary %s: %w", b.Name, dlErr)
		}

		copyRes, copyErr := platform.CopyBinary(result.Path, userBinDir, b.Name)
		if copyErr != nil {
			ins.Log.Printf("  [WARN] install %s → %s: %v", b.Name, userBinDir, copyErr)
			continue
		}
		ins.Log.Printf("  %s → %s", result.Path, copyRes.Path)
		if copyRes.Replaced {
			ins.Log.Printf("  [WARN] replaced existing %s (was pointing at %s)", b.Name, copyRes.PreviousTarget)
		}
		installed = append(installed, b.Name)
	}
	return installed, nil
}
