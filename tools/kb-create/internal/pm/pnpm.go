package pm

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"github.com/kb-labs/create/internal/toolchain"
)

// PnpmManager implements PackageManager using pnpm.
type PnpmManager struct {
	Registry string // optional: custom registry URL (e.g. http://localhost:4873)
	// StoreDir optionally points pnpm at a shared content-addressable store. When
	// every release dir shares one store on the same filesystem, identical package
	// versions are hardlinked into each release's node_modules instead of copied —
	// so N releases of a service cost one copy of the shared deps plus small
	// per-release deltas, not N×600MB. Empty = pnpm's default per-drive store.
	StoreDir string
}

func (p *PnpmManager) Name() string        { return "pnpm" }
func (p *PnpmManager) RegistryURL() string { return p.Registry }

func (p *PnpmManager) Install(dir string, pkgs []string, progress chan<- Progress) error {
	return p.run(dir, p.installArgs("add", dir, pkgs), progress)
}

func (p *PnpmManager) Update(dir string, pkgs []string, progress chan<- Progress) error {
	return p.run(dir, p.installArgs("update", dir, pkgs), progress)
}

func (p *PnpmManager) Restore(dir string, progress chan<- Progress) error {
	args := []string{"install", "--dir", dir, "--reporter=append-only"}
	if p.Registry != "" {
		args = append(args, "--registry", p.Registry)
	}
	return p.run(dir, args, progress)
}

// installArgs selects pnpm's append-only reporter. The default reporter owns
// the terminal cursor and emits carriage-return updates, which conflicts with
// kb-create's single-line spinner. Raw output is still collected for a fatal
// error report; it is simply no longer allowed to redraw the user's terminal.
func (p *PnpmManager) installArgs(command, dir string, pkgs []string) []string {
	args := []string{command, "--dir", dir, "--reporter=append-only"}
	// Build permissions are written to pnpm-workspace.yaml by ensureNpmrc.
	// Do not pass --allow-build here: it is not supported by all pnpm 11
	// patch releases, while the workspace config is the stable interface.
	args = append(args, pkgs...)
	if p.Registry != "" {
		args = append(args, "--registry", p.Registry)
	}
	return args
}

func (p *PnpmManager) ListInstalled(dir string) ([]InstalledPackage, error) {
	// `Installed` is evaluated before the first package is added. pnpm reports
	// exit code 1 when a valid new platform directory has no node_modules yet;
	// that is an empty inventory, not an installer failure. Avoid spawning pnpm
	// in that state so first-run behaviour is independent of a user's HOME,
	// global pnpm configuration, or shell setup.
	if _, err := os.Stat(filepath.Join(dir, "node_modules")); err != nil {
		if os.IsNotExist(err) {
			return []InstalledPackage{}, nil
		}
		return nil, fmt.Errorf("inspect node_modules: %w", err)
	}

	// #nosec G204 -- command name is fixed; dir is passed as an argument.
	cmd := exec.CommandContext(context.Background(), "pnpm", "list", "--dir", dir, "--json", "--depth=0")
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "NPM_CONFIG_USERCONFIG="+filepath.Join(dir, ".npmrc"))
	out, err := cmd.Output()
	if err != nil && len(out) == 0 {
		return nil, fmt.Errorf("pnpm list: %w", err)
	}

	// pnpm list --json returns an array
	var results []struct {
		Dependencies map[string]struct {
			Version string `json:"version"`
		} `json:"dependencies"`
	}
	if err := json.Unmarshal(out, &results); err != nil {
		return nil, err
	}

	var pkgList []InstalledPackage
	if len(results) > 0 {
		for name, dep := range results[0].Dependencies {
			pkgList = append(pkgList, InstalledPackage{
				Name:    name,
				Version: dep.Version,
			})
		}
	}
	return pkgList, nil
}

func (p *PnpmManager) run(dir string, args []string, progress chan<- Progress) error {
	if err := ensurePackageJSON(dir); err != nil {
		return err
	}
	if err := pinPnpmPackageJSON(dir); err != nil {
		return err
	}
	if err := p.ensureNpmrc(dir); err != nil {
		return err
	}

	sawIgnoredBuilds := false
	if err := p.runOnce(dir, args, progress, &sawIgnoredBuilds); err != nil {
		if !sawIgnoredBuilds {
			return err
		}
		// pnpm-workspace.yaml's onlyBuiltDependencies allowlist (written above by
		// ensureNpmrc) isn't always honored on the platform's large, transitive-heavy
		// dependency tree — pnpm still stops non-interactively asking for
		// `pnpm approve-builds`. Run that headlessly and retry once instead of
		// leaving the user stuck with no TTY to answer the prompt.
		if approveErr := p.approveBuilds(dir, progress); approveErr != nil {
			return fmt.Errorf("%w (auto-approve-builds also failed: %v)", err, approveErr)
		}
		return p.runOnce(dir, args, progress, new(bool))
	}
	return nil
}

// runOnce runs a single pnpm invocation, streaming output to progress and
// setting *ignoredBuilds when the output indicates ERR_PNPM_IGNORED_BUILDS.
func (p *PnpmManager) runOnce(dir string, args []string, progress chan<- Progress, ignoredBuilds *bool) error {
	// #nosec G204 -- command name is fixed; args are internal package names/options.
	cmd := exec.CommandContext(context.Background(), "pnpm", args...)
	cmd.Dir = dir

	// Isolate pnpm from the user's global ~/.npmrc: point NPM_CONFIG_USERCONFIG
	// at the platform-local .npmrc (written by ensureNpmrc). Without this,
	// pnpm reads ~/.npmrc and emits "Failed to replace env in config: ${NPM_TOKEN}"
	// warnings that clutter installer output and confuse users.
	cmd.Env = append(os.Environ(), "NPM_CONFIG_USERCONFIG="+filepath.Join(dir, ".npmrc"))

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("pnpm: %w", err)
	}

	done := make(chan struct{}, 2)
	var output strings.Builder
	var outputMu sync.Mutex
	pipe := func(r interface{ Read([]byte) (int, error) }) {
		scanner := bufio.NewScanner(r)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.Contains(line, "ERR_PNPM_IGNORED_BUILDS") {
				*ignoredBuilds = true
			}
			if strings.TrimSpace(line) != "" {
				outputMu.Lock()
				output.WriteString(line)
				output.WriteByte('\n')
				outputMu.Unlock()
				progress <- Progress{Line: line}
			}
		}
		done <- struct{}{}
	}
	go pipe(stdout)
	go pipe(stderr)
	<-done
	<-done

	err = cmd.Wait()
	if err == nil {
		return nil
	}
	outputMu.Lock()
	tail := commandTail(output.String(), 12)
	outputMu.Unlock()
	return &CommandError{Command: "pnpm " + strings.Join(args, " "), Output: tail, Cause: err}
}

func commandTail(output string, limit int) string {
	lines := strings.Split(strings.TrimSpace(output), "\n")
	if len(lines) > limit {
		lines = lines[len(lines)-limit:]
	}
	return strings.Join(lines, "\n")
}

// approveBuilds runs `pnpm approve-builds --all` headlessly in dir, allowing
// all pending dependency build scripts without an interactive prompt. Used as
// a fallback when the pre-written pnpm-workspace.yaml allowlist wasn't
// honored for the resolved dependency tree.
//
// --all approves every pending build script, not just the names ensureNpmrc
// pre-approved — so unlike that curated allowlist, this path isn't itself a
// vetting step. What it does provide is an audit trail: every approved
// package name (pnpm's own output names each one, e.g. "esbuild@0.28.2
// postinstall$ ...") is surfaced through the same progress stream as the
// rest of the install, and the resulting pnpm-workspace.yaml allowBuilds
// list — which pnpm persists after approval — stays on disk for later review,
// instead of the approval happening silently.
func (p *PnpmManager) approveBuilds(dir string, progress chan<- Progress) error {
	// #nosec G204 -- command name and flags are fixed; dir is passed as an argument.
	cmd := exec.CommandContext(context.Background(), "pnpm", "approve-builds", "--all", "--dir", dir)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "NPM_CONFIG_USERCONFIG="+filepath.Join(dir, ".npmrc"))
	out, err := cmd.CombinedOutput()
	progress <- Progress{Line: "[approve-builds] auto-approving pending build scripts (ERR_PNPM_IGNORED_BUILDS recovery):"}
	for _, line := range strings.Split(strings.TrimRight(string(out), "\n"), "\n") {
		if strings.TrimSpace(line) != "" {
			progress <- Progress{Line: "[approve-builds] " + line}
		}
	}
	if err != nil {
		return fmt.Errorf("pnpm approve-builds --all: %w\n%s", err, out)
	}
	return nil
}

func pinPnpmPackageJSON(dir string) error {
	path := filepath.Join(dir, "package.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var pkg map[string]interface{}
	if err := json.Unmarshal(data, &pkg); err != nil {
		return fmt.Errorf("parse platform package.json: %w", err)
	}
	pkg["packageManager"] = "pnpm@" + toolchain.PnpmVersion
	engines, _ := pkg["engines"].(map[string]interface{})
	if engines == nil {
		engines = map[string]interface{}{}
	}
	engines["node"] = ">=24"
	pkg["engines"] = engines
	rendered, err := json.MarshalIndent(pkg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(rendered, '\n'), 0o600)
}

// ensureNpmrc writes a platform-local .npmrc. It is always written (even when
// no custom registry is configured) because the installer points pnpm's
// NPM_CONFIG_USERCONFIG at this file to isolate it from the user's global
// ~/.npmrc. Without an isolated config, pnpm surfaces warnings from unrelated
// entries in ~/.npmrc (e.g. unresolved ${NPM_TOKEN}) during install.
func (p *PnpmManager) ensureNpmrc(dir string) error {
	registry := p.Registry
	if registry == "" {
		registry = os.Getenv("NPM_CONFIG_REGISTRY")
	}
	if registry == "" {
		registry = "https://registry.npmjs.org/"
	}
	// shamefully-hoist ensures all transitive KB Labs packages are reachable
	// from node_modules root, so plugins can resolve their deps at runtime.
	content := "registry=" + registry + "\nshamefully-hoist=true\n"
	// A shared store + hardlink import method dedupes packages across release
	// dirs. package-import-method=hardlink is pnpm's default, but we set it
	// explicitly so a global config can't silently downgrade us to copy.
	if p.StoreDir != "" {
		content += "store-dir=" + p.StoreDir + "\npackage-import-method=hardlink\n"
	}
	if err := os.WriteFile(filepath.Join(dir, ".npmrc"), []byte(content), 0o600); err != nil {
		return err
	}
	// pnpm 10+ reads workspace settings from pnpm-workspace.yaml, not from
	// package.json. The platform is intentionally a standalone workspace so
	// clean installs can allow native build scripts without an interactive
	// `pnpm approve-builds` prompt and retain the platform overrides.
	workspaceConfig := "allowBuilds:\n"
	for _, name := range []string{
		"@kb-labs/devkit",
		"@parcel/watcher",
		"@swc/core",
		"better-sqlite3",
		"esbuild",
		"unrs-resolver",
	} {
		workspaceConfig += "  '" + name + "': true\n"
	}
	workspaceConfig += "onlyBuiltDependencies:\n"
	for _, name := range []string{
		"@kb-labs/devkit",
		"@parcel/watcher",
		"@swc/core",
		"better-sqlite3",
		"esbuild",
		"unrs-resolver",
	} {
		workspaceConfig += "  - '" + name + "'\n"
	}
	workspaceConfig += "overrides:\n"
	for _, name := range []string{
		"@kb-labs/gateway-contracts",
		"@kb-labs/gateway-auth",
		"@kb-labs/gateway-core",
		"@kb-labs/sdk",
		"@kb-labs/core-runtime",
		"@kb-labs/core-platform",
	} {
		workspaceConfig += "  '" + name + "': '>=2.0.0'\n"
	}
	return os.WriteFile(filepath.Join(dir, "pnpm-workspace.yaml"), []byte(workspaceConfig), 0o600)
}
