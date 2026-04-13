// Package installer orchestrates the KB Labs platform installation and update
// lifecycle. It delegates package operations to a pm.PackageManager and
// persists the resulting configuration via the config package.
package installer

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/kb-labs/create/internal/bindown"
	"github.com/kb-labs/create/internal/config"
	"github.com/kb-labs/create/internal/detect"
	"github.com/kb-labs/create/internal/logger"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/platform"
	"github.com/kb-labs/create/internal/pm"
	"github.com/kb-labs/create/internal/scan"
	"github.com/kb-labs/create/internal/types"
	"github.com/kb-labs/create/internal/userstate"
)

// Selection holds what the user chose to install.
type Selection struct {
	PlatformDir      string
	ProjectCWD       string
	Services         []string // component IDs
	Plugins          []string // component IDs
	Telemetry        config.TelemetryConfig
	Project          *detect.ProjectProfile // detected project info (may be nil)
	DemoMode         bool
	DevMode          bool   // true when --dev-manifest flag is set; enables pnpm pack pre-step
	Registry         string // optional: custom npm registry URL (e.g. http://localhost:4873)
	Consent          types.ConsentChoice
	APIKey           string `json:"-"` // only when Consent == types.ConsentOwnKey // #nosec G117 -- not serialized
	TelemetryEnabled bool
}

// Result is returned after a successful Install.
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

// UpdateResult is returned after a successful Update.
type UpdateResult struct {
	Diff     *UpdateDiff
	Duration time.Duration
}

// Installer orchestrates platform installation and updates.
type Installer struct {
	PM     pm.PackageManager
	Log    *logger.Logger
	OnStep func(step, total int, label string) // called at each named stage
	OnLine func(line string)                   // called for each raw output line from pm
}

// Install installs the platform according to sel.
// All selected packages are passed to the package manager in a single
// invocation so it can resolve and deduplicate the dependency graph at once.
func (ins *Installer) Install(sel *Selection, m *manifest.Manifest) (*Result, error) {
	start := time.Now()

	totalSteps := 3 // packages + scan + config (binaries add +1)
	if len(m.Binaries) > 0 {
		totalSteps = 4
	}
	step := 0

	// Step 1: npm/pnpm packages.
	allPkgs := m.CorePackageSpecs()
	allPkgs = append(allPkgs, m.AdapterPackageSpecs()...)
	allPkgs = append(allPkgs, ins.selectedPkgSpecs(m.Services, sel.Services)...)
	allPkgs = append(allPkgs, ins.selectedPkgSpecs(m.Plugins, sel.Plugins)...)

	// Install companion plugins for selected services (e.g. workflow-daemon → workflow-entry).
	for _, svc := range m.Services {
		if svc.Plugin != "" && slices.Contains(sel.Services, svc.ID) {
			allPkgs = append(allPkgs, svc.Plugin)
		}
	}

	// Dev mode: pack local directory specs into self-contained tarballs so
	// pnpm can resolve workspace:* and link: refs inside those packages.
	// Only runs when --dev-manifest flag was provided (sel.DevMode == true).
	if sel.DevMode {
		ins.Log.Printf("  [dev] packing local packages into tarballs...")
		packed, cleanup, packErr := packLocalDirSpecs(allPkgs, ins.Log)
		defer cleanup()
		if packErr != nil {
			return nil, fmt.Errorf("pack local packages: %w", packErr)
		}
		allPkgs = packed
	}

	step++
	ins.step(step, totalSteps, fmt.Sprintf("Installing %d packages via %s", len(allPkgs), ins.PM.Name()))
	if err := ins.installGroup(sel.PlatformDir, allPkgs); err != nil {
		return nil, fmt.Errorf("install: %w", err)
	}

	// Step 2: Go binaries from GitHub Releases.
	var installedBinaries []string
	if len(m.Binaries) > 0 {
		step++
		ins.step(step, totalSteps, fmt.Sprintf("Installing %d binaries", len(m.Binaries)))
		var binErr error
		installedBinaries, binErr = ins.installBinaries(sel.PlatformDir, m.Binaries)
		if binErr != nil {
			// Non-fatal: log warning but continue. Services can be installed later.
			ins.Log.Printf("  [WARN] binary install failed: %v", binErr)
			if ins.OnLine != nil {
				ins.OnLine(fmt.Sprintf("WARN: binary install failed: %v (services can be started manually)", binErr))
			}
		}
	}

	// Step 3: Scan installed packages for manifests → generate marketplace.lock + devservices.yaml.
	step++
	ins.step(step, totalSteps, "Scanning manifests")
	scanResult, scanErr := scan.Run(sel.PlatformDir)
	if scanErr != nil {
		ins.Log.Printf("  [WARN] manifest scan failed: %v", scanErr)
		if ins.OnLine != nil {
			ins.OnLine(fmt.Sprintf("WARN: manifest scan: %v", scanErr))
		}
	} else {
		ins.Log.Printf("  found %d plugins, %d adapters, %d services",
			len(scanResult.Plugins), len(scanResult.Adapters), len(scanResult.Services))
		for _, e := range scanResult.Errors {
			ins.Log.Printf("  [WARN] %s: %s", e.Package, e.Error)
		}
		if err := scan.WriteConfigs(sel.PlatformDir, scanResult); err != nil {
			ins.Log.Printf("  [WARN] write configs: %v", err)
		}

	}

	// Symlink kb CLI into ~/.local/bin/ for PATH availability.
	ins.symlinkCLI(sel.PlatformDir)

	// Create the project .kb/ directory. The installer owns this so that
	// all callers (CLI, tests) get a consistent project layout regardless
	// of how they invoke Install. The scaffold step (kb.config.jsonc) is
	// written by cmd/create.go on top of this foundation.
	if sel.ProjectCWD != "" {
		if err := os.MkdirAll(filepath.Join(sel.ProjectCWD, ".kb"), 0o750); err != nil {
			return nil, fmt.Errorf("create project .kb dir: %w", err)
		}
	}

	step++
	ins.step(step, totalSteps, "Writing config")
	cfg := config.NewConfig(sel.PlatformDir, sel.ProjectCWD, ins.PM.Name(), m, sel.Telemetry)
	cfg.SelectedServices = sel.Services
	cfg.SelectedPlugins = sel.Plugins
	if sel.Project != nil {
		cfg.Project = sel.Project.ToMap()
	}
	if err := config.Write(sel.PlatformDir, cfg); err != nil {
		return nil, fmt.Errorf("config: %w", err)
	}

	// Generate gateway upstreams from discovered services + manifest gateway info.
	if scanResult != nil {
		infoMap := make(map[string]scan.ServiceGatewayInfo)
		for _, svc := range m.Services {
			if svc.GatewayPrefix != "" {
				infoMap[svc.ID] = scan.ServiceGatewayInfo{
					Prefix:  svc.GatewayPrefix,
					Rewrite: svc.GatewayRewrite,
				}
			}
		}
		if len(infoMap) > 0 {
			gwCfg := scan.GenerateGatewayConfig(scanResult, infoMap)
			if err := scan.MergeGatewayIntoConfig(sel.PlatformDir, gwCfg); err != nil {
				ins.Log.Printf("  [WARN] gateway config: %v", err)
			}
		}
	}

	// Persist "last known install" so subsequent kb-create commands
	// (status/doctor/update/uninstall) can auto-discover the platform
	// without requiring --platform every time. Non-fatal: a failure here
	// just means the user has to pass --platform manually.
	if err := userstate.Write(&userstate.State{
		LastPlatformDir: sel.PlatformDir,
		LastProjectDir:  sel.ProjectCWD,
	}); err != nil {
		ins.Log.Printf("  [WARN] write user state: %v", err)
	}

	hasServices := scanErr == nil && len(scanResult.Services) > 0

	return &Result{
		PlatformDir:       sel.PlatformDir,
		ProjectCWD:        sel.ProjectCWD,
		ConfigPath:        config.ConfigPath(sel.PlatformDir),
		Duration:          time.Since(start),
		InstalledBinaries: installedBinaries,
		HasServices:       hasServices,
	}, nil
}

// Diff computes what would change if Update were applied now.
// "installed" is derived from the saved manifest + user selection.
// "desired" is derived from the new manifest + same user selection.
func (ins *Installer) Diff(platformDir string, current *manifest.Manifest) (*UpdateDiff, error) {
	cfg, err := config.Read(platformDir)
	if err != nil {
		return nil, err
	}

	installed := installedSet(cfg)
	desired := desiredSet(current, cfg.SelectedServices, cfg.SelectedPlugins)

	diff := &UpdateDiff{}
	for pkg := range desired {
		if _, ok := installed[pkg]; !ok {
			diff.Added = append(diff.Added, pkg)
		} else {
			diff.Updated = append(diff.Updated, pkg)
		}
	}
	for pkg := range installed {
		if _, ok := desired[pkg]; !ok {
			diff.Removed = append(diff.Removed, pkg)
		}
	}
	return diff, nil
}

// Update applies the diff: installs new packages, updates existing ones.
func (ins *Installer) Update(platformDir string, current *manifest.Manifest) (*UpdateResult, error) {
	start := time.Now()

	diff, err := ins.Diff(platformDir, current)
	if err != nil {
		return nil, err
	}

	cfg, err := config.Read(platformDir)
	if err != nil {
		return nil, err
	}

	if len(diff.Added) > 0 {
		ins.Log.Printf("Installing new packages: %s", strings.Join(diff.Added, " "))
		if err := ins.installGroup(platformDir, diff.Added); err != nil {
			return nil, fmt.Errorf("add new packages: %w", err)
		}
	}

	allPkgs := cfg.InstalledPackageNames()
	if err := ins.updateGroup(platformDir, allPkgs); err != nil {
		return nil, fmt.Errorf("update packages: %w", err)
	}

	// Refresh config snapshot.
	cfg.Manifest = *current
	if err := config.Write(platformDir, cfg); err != nil {
		return nil, err
	}

	return &UpdateResult{Diff: diff, Duration: time.Since(start)}, nil
}

// ── helpers ──────────────────────────────────────────────────────────────────

func (ins *Installer) step(n, total int, label string) {
	ins.Log.Printf("[%d/%d] %s", n, total, label)
	if ins.OnStep != nil {
		ins.OnStep(n, total, label)
	}
}

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

		result, dlErr := bindown.Download(b.Repo, b.Name, binDir, ch)
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

// installGroup installs pkgs into dir, draining progress lines to the log
// and forwarding each line to OnLine if set.
// It waits for the drain goroutine to finish before returning so no output
// is lost even when the channel is buffered.
func (ins *Installer) installGroup(dir string, pkgs []string) error {
	return ins.runGroup(dir, pkgs, ins.PM.Install)
}

// updateGroup updates pkgs in dir, draining progress lines to the log.
func (ins *Installer) updateGroup(dir string, pkgs []string) error {
	return ins.runGroup(dir, pkgs, ins.PM.Update)
}

// runGroup is the shared driver for installGroup / updateGroup.
func (ins *Installer) runGroup(dir string, pkgs []string, op func(string, []string, chan<- pm.Progress) error) error {
	ch := make(chan pm.Progress, 64)
	done := make(chan struct{})
	go func() {
		defer close(done)
		for p := range ch {
			if p.Line == "" {
				continue
			}
			ins.Log.Printf("  %s", p.Line)
			if ins.OnLine != nil {
				ins.OnLine(p.Line)
			}
		}
	}()
	err := op(dir, pkgs, ch)
	close(ch)
	<-done // wait for drain goroutine to flush all buffered lines
	return err
}

func (ins *Installer) selectedPkgs(components []manifest.Component, ids []string) []string {
	set := make(map[string]bool, len(ids))
	for _, id := range ids {
		set[id] = true
	}
	var out []string
	for _, c := range components {
		if set[c.ID] {
			out = append(out, c.Pkg)
		}
	}
	return out
}

func (ins *Installer) selectedPkgSpecs(components []manifest.Component, ids []string) []string {
	set := make(map[string]bool, len(ids))
	for _, id := range ids {
		set[id] = true
	}
	var out []string
	for _, c := range components {
		if set[c.ID] {
			out = append(out, c.PackageSpec())
		}
	}
	return out
}

// packLocalDirSpecs converts "name@file:/path/to/dir" specs into
// "name@file:/tmp/xxx/name-1.0.0.tgz" by running pnpm pack in each local dir.
// Specs that are already npm names or .tgz paths are left unchanged.
// The returned cleanup func removes the shared tmp dir; call it even on error.
func packLocalDirSpecs(specs []string, log *logger.Logger) (out []string, cleanup func(), err error) {
	tmpDir, mkErr := os.MkdirTemp("", "kb-dev-pack-*")
	if mkErr != nil {
		return nil, func() {}, fmt.Errorf("create tmp dir: %w", mkErr)
	}
	cleanup = func() { _ = os.RemoveAll(tmpDir) }

	out = make([]string, len(specs))
	copy(out, specs)

	for i, spec := range specs {
		name, localDir, ok := parseFileDirSpec(spec)
		if !ok {
			continue // plain npm name or already a .tgz — leave as-is
		}
		log.Printf("  pnpm pack %s", localDir)
		// #nosec G204 -- localDir is from user-provided dev-manifest; tmpDir is our own temp dir
		cmd := exec.CommandContext(context.Background(), "pnpm", "pack", "--pack-destination", tmpDir)
		cmd.Dir = localDir
		if cmdOut, cmdErr := cmd.CombinedOutput(); cmdErr != nil {
			return out, cleanup, fmt.Errorf("pnpm pack %s: %w\n%s", localDir, cmdErr, cmdOut)
		}
		tarballs, globErr := filepath.Glob(filepath.Join(tmpDir, "*.tgz"))
		if globErr != nil || len(tarballs) == 0 {
			return out, cleanup, fmt.Errorf("pnpm pack %s: no .tgz produced", localDir)
		}
		tarball := latestFile(tarballs)
		out[i] = name + "@file:" + tarball
		log.Printf("  packed  → %s", filepath.Base(tarball))
	}
	return out, cleanup, nil
}

// parseFileDirSpec extracts the package name and local directory from a spec
// like "name@file:/abs/dir". Returns ok=false for plain npm names or .tgz specs.
func parseFileDirSpec(spec string) (name, dir string, ok bool) {
	atIdx := strings.LastIndex(spec, "@file:")
	if atIdx < 0 {
		return "", "", false
	}
	p := spec[atIdx+len("@file:"):]
	if strings.HasSuffix(p, ".tgz") {
		return "", "", false
	}
	return spec[:atIdx], p, true
}

// latestFile returns the most recently modified path from the given list.
func latestFile(paths []string) string {
	best := paths[0]
	var bestTime time.Time
	for _, p := range paths {
		if info, statErr := os.Stat(p); statErr == nil && info.ModTime().After(bestTime) {
			bestTime = info.ModTime()
			best = p
		}
	}
	return best
}

// installedSet returns the set of package names that were actually installed
// based on the user's selection stored in config.
func installedSet(cfg *config.PlatformConfig) map[string]bool {
	s := make(map[string]bool)
	for _, name := range cfg.InstalledPackageNames() {
		s[name] = true
	}
	return s
}

// desiredSet returns the set of package names that should be installed
// according to the given manifest and the user's original selections.
func desiredSet(m *manifest.Manifest, selectedServices, selectedPlugins []string) map[string]bool {
	svcSet := make(map[string]bool, len(selectedServices))
	for _, id := range selectedServices {
		svcSet[id] = true
	}
	plSet := make(map[string]bool, len(selectedPlugins))
	for _, id := range selectedPlugins {
		plSet[id] = true
	}

	s := make(map[string]bool)
	for _, p := range m.Core {
		s[p.Name] = true
	}
	for _, a := range m.Adapters {
		s[a.Name] = true
	}
	for _, c := range m.Services {
		if svcSet[c.ID] {
			s[c.Pkg] = true
		}
	}
	for _, c := range m.Plugins {
		if plSet[c.ID] {
			s[c.Pkg] = true
		}
	}
	return s
}
