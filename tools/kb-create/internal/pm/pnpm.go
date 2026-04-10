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

// PnpmManager implements PackageManager using pnpm.
type PnpmManager struct {
	Registry string // optional: custom registry URL (e.g. http://localhost:4873)
}

func (p *PnpmManager) Name() string { return "pnpm" }

func (p *PnpmManager) Install(dir string, pkgs []string, progress chan<- Progress) error {
	args := append([]string{"add", "--dir", dir}, pkgs...)
	if p.Registry != "" {
		args = append(args, "--registry", p.Registry)
	}
	return p.run(dir, args, progress)
}

func (p *PnpmManager) Update(dir string, pkgs []string, progress chan<- Progress) error {
	args := append([]string{"update", "--dir", dir}, pkgs...)
	if p.Registry != "" {
		args = append(args, "--registry", p.Registry)
	}
	return p.run(dir, args, progress)
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
	if err := p.ensureNpmrc(dir); err != nil {
		return err
	}

	// #nosec G204 -- command name is fixed; args are internal package names/options.
	cmd := exec.CommandContext(context.Background(), "pnpm", args...)
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

// ensureNpmrc writes a project-level .npmrc into dir when a custom registry is
// configured. pnpm reads .npmrc by hierarchy (project → workspace → home), so
// this takes precedence over ~/.npmrc and avoids unset-variable warnings there.
func (p *PnpmManager) ensureNpmrc(dir string) error {
	if p.Registry == "" {
		return nil
	}
	content := "registry=" + p.Registry + "\n"
	return os.WriteFile(filepath.Join(dir, ".npmrc"), []byte(content), 0o600)
}
