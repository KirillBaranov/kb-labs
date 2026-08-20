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
)

// NpmManager implements PackageManager using npm.
type NpmManager struct {
	Registry         string            // optional: custom registry URL (e.g. http://localhost:4873)
	PackageOverrides map[string]string // explicit platform-owned pins for this install wave
}

func (n *NpmManager) Name() string        { return "npm" }
func (n *NpmManager) RegistryURL() string { return n.Registry }

func (n *NpmManager) Install(dir string, pkgs []string, progress chan<- Progress) error {
	args := append([]string{"install", "--prefix", dir}, pkgs...)
	if n.Registry != "" {
		args = append(args, "--registry", n.Registry)
	}
	return n.run(dir, args, progress)
}

func (n *NpmManager) Update(dir string, pkgs []string, progress chan<- Progress) error {
	args := append([]string{"update", "--prefix", dir}, pkgs...)
	if n.Registry != "" {
		args = append(args, "--registry", n.Registry)
	}
	return n.run(dir, args, progress)
}

func (n *NpmManager) Restore(dir string, progress chan<- Progress) error {
	args := []string{"install", "--prefix", dir}
	if n.Registry != "" {
		args = append(args, "--registry", n.Registry)
	}
	return n.run(dir, args, progress)
}

func (n *NpmManager) ListInstalled(dir string) ([]InstalledPackage, error) {
	nmDir := filepath.Join(dir, "node_modules")
	if _, err := os.Stat(nmDir); os.IsNotExist(err) {
		return nil, nil
	}

	// #nosec G204 -- command name is fixed; dir is passed as an argument.
	cmd := exec.CommandContext(context.Background(), "npm", "list", "--prefix", dir, "--json", "--depth=0")
	cmd.Dir = dir
	out, err := cmd.Output()
	if err != nil && len(out) == 0 {
		return nil, fmt.Errorf("npm list: %w", err)
	}

	var result struct {
		Dependencies map[string]struct {
			Version string `json:"version"`
		} `json:"dependencies"`
	}
	if err := json.Unmarshal(out, &result); err != nil {
		return nil, err
	}

	pkgs := make([]InstalledPackage, 0, len(result.Dependencies))
	for name, dep := range result.Dependencies {
		pkgs = append(pkgs, InstalledPackage{Name: name, Version: dep.Version})
	}
	return pkgs, nil
}

func (n *NpmManager) run(dir string, args []string, progress chan<- Progress) error {
	if err := ensurePackageJSON(dir, n.PackageOverrides); err != nil {
		return err
	}

	// #nosec G204 -- command name is fixed; args are internal package names/options.
	cmd := exec.CommandContext(context.Background(), "npm", args...)
	cmd.Dir = dir

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("npm: %w", err)
	}

	// stream both stdout and stderr as progress lines
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

// defaultPackageOverrides are the safety floor for platforms created without
// an explicit axis selection. Explicit axis pins are merged on top and existing
// values are preserved on later package-manager calls.
var defaultPackageOverrides = map[string]string{
	"@kb-labs/gateway-contracts": ">=2.0.0",
	"@kb-labs/gateway-auth":      ">=2.0.0",
	"@kb-labs/gateway-core":      ">=2.0.0",
	"@kb-labs/sdk":               ">=2.0.0",
	"@kb-labs/core-runtime":      ">=2.0.0",
	"@kb-labs/core-platform":     ">=2.0.0",
}

// ensurePackageJSON creates a minimal package.json if none exists.
func ensurePackageJSON(dir string, packageOverrides map[string]string) error {
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return err
	}
	pkgPath := filepath.Join(dir, "package.json")

	// Read existing file or start fresh.
	var pkg map[string]interface{}
	if data, err := os.ReadFile(pkgPath); err == nil {
		_ = json.Unmarshal(data, &pkg)
	}
	if pkg == nil {
		pkg = map[string]interface{}{
			"name":    "kb-platform",
			"version": "1.0.0",
			"private": true,
		}
	}

	// Ensure pnpm.overrides contains the safety floor without replacing a
	// platform axis pin written by an earlier install. A configured axis is the
	// explicit owner and may replace the value for this install wave.
	pnpmBlock, _ := pkg["pnpm"].(map[string]interface{})
	if pnpmBlock == nil {
		pnpmBlock = map[string]interface{}{}
	}
	overrides, _ := pnpmBlock["overrides"].(map[string]interface{})
	if overrides == nil {
		overrides = map[string]interface{}{}
	}
	for k, v := range defaultPackageOverrides {
		if _, exists := overrides[k]; !exists {
			overrides[k] = v
		}
	}
	for k, v := range packageOverrides {
		overrides[k] = v
	}
	pnpmBlock["overrides"] = overrides
	// pnpm 10+ blocks dependency build scripts by default. The platform is an
	// installer-managed runtime, so explicitly allow the native/runtime builds
	// required by its packages instead of asking every user to run approve-builds.
	pnpmBlock["onlyBuiltDependencies"] = []string{
		"@kb-labs/devkit",
		"@parcel/watcher",
		"@swc/core",
		"better-sqlite3",
		"esbuild",
		"unrs-resolver",
	}
	pkg["pnpm"] = pnpmBlock

	// npm does not read pnpm.overrides. Keep explicit axis pins in npm's native
	// overrides block as well for launcher projects that fall back to npm.
	npmOverrides, _ := pkg["overrides"].(map[string]interface{})
	if npmOverrides == nil {
		npmOverrides = map[string]interface{}{}
	}
	for k, v := range packageOverrides {
		npmOverrides[k] = v
	}
	pkg["overrides"] = npmOverrides

	data, err := json.MarshalIndent(pkg, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(pkgPath, append(data, '\n'), 0o600); err != nil {
		return err
	}

	// Write .npmrc: disable user-level config + hoist all packages so plugins
	// can resolve their transitive deps from the platform node_modules root.
	npmrcPath := filepath.Join(dir, ".npmrc")
	npmrc := "# KB Labs platform — local npm config\nregistry=https://registry.npmjs.org/\nshamefully-hoist=true\n"
	_ = os.WriteFile(npmrcPath, []byte(npmrc), 0o600)
	return nil
}
