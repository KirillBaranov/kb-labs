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

// installArgs selects pnpm's append-only reporter. The default reporter owns
// the terminal cursor and emits carriage-return updates, which conflicts with
// kb-create's single-line spinner. Raw output is still collected for a fatal
// error report; it is simply no longer allowed to redraw the user's terminal.
func (p *PnpmManager) installArgs(command, dir string, pkgs []string) []string {
	args := append([]string{command, "--dir", dir, "--reporter=append-only"}, pkgs...)
	if p.Registry != "" {
		args = append(args, "--registry", p.Registry)
	}
	return args
}

func (p *PnpmManager) ListInstalled(dir string) ([]InstalledPackage, error) {
	// #nosec G204 -- command name is fixed; dir is passed as an argument.
	cmd := exec.CommandContext(context.Background(), "pnpm", "list", "--dir", dir, "--json", "--depth=0")
	cmd.Dir = dir
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
	pipe := func(r interface{ Read([]byte) (int, error) }) {
		scanner := bufio.NewScanner(r)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.TrimSpace(line) != "" {
				progress <- Progress{Line: line}
			}
		}
		done <- struct{}{}
	}
	go pipe(stdout)
	go pipe(stderr)
	<-done
	<-done

	return cmd.Wait()
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
	return os.WriteFile(filepath.Join(dir, ".npmrc"), []byte(content), 0o600)
}
