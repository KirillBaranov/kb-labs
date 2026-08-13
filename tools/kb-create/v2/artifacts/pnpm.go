// Package artifacts contains V2's exact-artifact executor. It receives only
// immutable artifact versions from ResolvedInstallPlan; it never resolves npm
// tags, scans node_modules for product decisions, or imports legacy pm code.
package artifacts

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"

	"github.com/kb-labs/create/v2/contracts"
)

type Runner interface {
	Run(context.Context, io.Writer, string, ...string) error
}

type commandRunner struct{}

func (commandRunner) Run(ctx context.Context, output io.Writer, name string, args ...string) error {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Stdout, cmd.Stderr = output, output
	return cmd.Run()
}

type Pnpm struct {
	Root     string
	Registry string
	Runner   Runner
	// Log receives the complete package-manager transcript. It is deliberately
	// file-oriented: raw package-manager output must never pollute human or JSON
	// command output.
	Log io.Writer
}

func (p Pnpm) Install(items []contracts.Artifact) error {
	if err := p.prepare(); err != nil {
		return err
	}
	specs, err := specs(items)
	if err != nil {
		return err
	}
	if len(specs) == 0 {
		return nil
	}
	return p.run("add", specs...)
}
func (p Pnpm) Restore() error {
	if err := p.prepare(); err != nil {
		return err
	}
	return p.run("install")
}
func (p Pnpm) Uninstall(items []contracts.Artifact) error {
	if err := p.prepare(); err != nil {
		return err
	}
	specs, err := specs(items)
	if err != nil {
		return err
	}
	if len(specs) == 0 {
		return nil
	}
	return p.run("remove", specs...)
}

func (p Pnpm) run(command string, specs ...string) error {
	if p.Root == "" {
		return fmt.Errorf("V2 platform root is required")
	}
	args := []string{command, "--dir", p.Root, "--reporter=append-only"}
	args = append(args, specs...)
	if p.Registry != "" {
		args = append(args, "--registry", p.Registry)
	}
	runner := p.Runner
	if runner == nil {
		runner = commandRunner{}
	}
	log := p.Log
	if log == nil {
		log = io.Discard
	}
	if err := runner.Run(context.Background(), log, "pnpm", args...); err != nil {
		return fmt.Errorf("pnpm %s exact artifacts: %w", command, err)
	}
	return nil
}

func (p Pnpm) prepare() error {
	if p.Root == "" {
		return fmt.Errorf("V2 platform root is required")
	}
	if err := os.MkdirAll(p.Root, 0o750); err != nil {
		return err
	}
	path := filepath.Join(p.Root, "package.json")
	if _, err := os.Stat(path); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	data, _ := json.MarshalIndent(map[string]any{"name": "kb-platform", "private": true, "packageManager": "pnpm@11.4.0"}, "", "  ")
	return os.WriteFile(path, append(data, '\n'), 0o600)
}

func specs(items []contracts.Artifact) ([]string, error) {
	seen := make(map[string]struct{}, len(items))
	result := make([]string, 0, len(items))
	for _, item := range items {
		if item.Kind == "binary" {
			continue
		}
		if item.Package == "" || item.Version == "" {
			return nil, fmt.Errorf("artifact %q must declare package and exact version", item.ID)
		}
		spec := item.Package + "@" + item.Version
		if _, exists := seen[spec]; !exists {
			seen[spec] = struct{}{}
			result = append(result, spec)
		}
	}
	sort.Strings(result)
	return result, nil
}
