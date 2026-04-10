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
	Registry string // optional: custom registry URL (e.g. http://localhost:4873)
}

func (n *NpmManager) Name() string { return "npm" }

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
	if err := ensurePackageJSON(dir); err != nil {
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

// ensurePackageJSON creates a minimal package.json if none exists.
func ensurePackageJSON(dir string) error {
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return err
	}
	pkgPath := filepath.Join(dir, "package.json")
	if _, err := os.Stat(pkgPath); err == nil {
		return nil
	}
	// Overrides fix semver 0.x caret ranges (^0.1.0 doesn't match 0.2.0).
	// Remove once all packages publish with aligned deps.
	content := `{
  "name": "kb-platform",
  "version": "1.0.0",
  "private": true,
  "pnpm": {
    "overrides": {
      "@kb-labs/gateway-contracts": ">=0.1.0",
      "@kb-labs/gateway-auth": ">=0.1.0",
      "@kb-labs/gateway-core": ">=0.1.0"
    }
  }
}
`
	if err := os.WriteFile(pkgPath, []byte(content), 0o600); err != nil {
		return err
	}

	// Create a local .npmrc so pnpm/npm won't read the user-level ~/.npmrc
	// which may contain unresolved env vars like ${NPM_TOKEN}.
	npmrcPath := filepath.Join(dir, ".npmrc")
	if _, err := os.Stat(npmrcPath); err != nil {
		npmrc := "# KB Labs platform — local npm config\nregistry=https://registry.npmjs.org/\n"
		_ = os.WriteFile(npmrcPath, []byte(npmrc), 0o600)
	}
	return nil
}
