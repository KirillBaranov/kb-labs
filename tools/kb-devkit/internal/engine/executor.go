package engine

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/kb-labs/devkit/internal/cache"
	"github.com/kb-labs/devkit/internal/workspace"
)

// Executor runs a single (package, task) pair with cache lookup/store.
type Executor struct {
	objects    cache.ObjectStore
	manifests  *cache.ManifestStore
	wsRoot     string
	liveOutput bool // stream stdout/stderr while running
}

// NewExecutor creates an Executor backed by the given cache stores.
func NewExecutor(objects cache.ObjectStore, manifests *cache.ManifestStore, wsRoot string, liveOutput bool) *Executor {
	return &Executor{
		objects:    objects,
		manifests:  manifests,
		wsRoot:     wsRoot,
		liveOutput: liveOutput,
	}
}

// Run executes (pkg, task) with full cache semantics:
//  1. Compute input hash
//  2. Cache hit? → restore outputs + return cached result
//  3. Run command
//  4. Store outputs + write manifest
//  5. Return result
func (e *Executor) Run(pkg workspace.Package, def TaskDef, noCache bool) TaskResult {
	start := time.Now()

	// 1. Compute input hash.
	inputHash, err := cache.HashInputs(pkg.Dir, def.Inputs)
	if err != nil {
		return TaskResult{
			Package: pkg.Name, Task: def.Name,
			OK:    false,
			Error: fmt.Sprintf("hash inputs: %v", err),
		}
	}

	// 2. Cache lookup (skip if cache:false or --no-cache).
	if def.Cache && !noCache {
		if m, ok := e.manifests.Get(pkg.Name, def.Name, inputHash); ok {
			// Restore output files.
			if err := e.restoreOutputs(m, pkg.Dir); err == nil {
				return TaskResult{
					Package:  pkg.Name,
					Task:     def.Name,
					OK:       m.ExitCode == 0,
					Cached:   true,
					ExitCode: m.ExitCode,
					Stdout:   m.Stdout,
					Elapsed:  time.Since(start),
				}
			}
			// If restore fails, fall through to re-run.
		}
	}

	// 3. Run command.
	stdout, stderr, exitCode, runErr := e.runCommand(def.Command, pkg.Dir)
	elapsed := time.Since(start)

	result := TaskResult{
		Package:  pkg.Name,
		Task:     def.Name,
		OK:       exitCode == 0 && runErr == nil,
		Cached:   false,
		ExitCode: exitCode,
		Stdout:   stdout,
		Stderr:   stderr,
		Elapsed:  elapsed,
	}
	if runErr != nil {
		result.Error = runErr.Error()
	}

	// 4. Store outputs + write manifest (even on failure — helps debugging).
	if def.Cache {
		m := &cache.Manifest{
			InputHash: inputHash,
			ExitCode:  exitCode,
			Elapsed:   elapsed.String(),
		}
		if len(stdout) <= 64*1024 { // cap stdout at 64KB in manifest
			m.Stdout = stdout
		}
		if len(stderr) <= 8*1024 {
			m.Stderr = stderr
		}

		// Only store output files on success.
		if result.OK && len(def.Outputs) > 0 {
			refs, storeErr := e.storeOutputs(pkg.Dir, def.Outputs)
			if storeErr == nil {
				m.Outputs = refs
			}
		}

		_ = e.manifests.Put(pkg.Name, def.Name, m)
	}

	return result
}

// runCommand executes a shell command in dir, returning stdout, stderr, exit code.
// If e.liveOutput is true, output is also streamed to os.Stdout/os.Stderr in real time.
func (e *Executor) runCommand(command, dir string) (stdout, stderr string, exitCode int, err error) {
	parts := splitCommand(command)
	if len(parts) == 0 {
		return "", "", 1, fmt.Errorf("empty command")
	}

	bin := resolveBin(parts[0], e.wsRoot)

	var outBuf, errBuf bytes.Buffer

	var outW, errW io.Writer = &outBuf, &errBuf
	if e.liveOutput {
		outW = io.MultiWriter(&outBuf, os.Stdout)
		errW = io.MultiWriter(&errBuf, os.Stderr)
	}

	cmd := exec.Command(bin, parts[1:]...)
	cmd.Dir = dir
	cmd.Stdout = outW
	cmd.Stderr = errW
	cmd.Env = append(os.Environ(),
		"NODE_PATH="+filepath.Join(e.wsRoot, "node_modules"),
	)

	runErr := cmd.Run()
	exitCode = 0
	if cmd.ProcessState != nil {
		exitCode = cmd.ProcessState.ExitCode()
	}
	if runErr != nil && exitCode == 0 {
		exitCode = 1
	}

	return outBuf.String(), errBuf.String(), exitCode, nil
}

// storeOutputs walks output glob patterns, stores each file in ObjectStore,
// returns the OutputRef list for the manifest.
func (e *Executor) storeOutputs(pkgDir string, patterns []string) ([]cache.OutputRef, error) {
	fileList, err := expandOutputFiles(pkgDir, patterns)
	if err != nil {
		return nil, err
	}

	var refs []cache.OutputRef
	for _, rel := range fileList {
		absPath := filepath.Join(pkgDir, rel)
		sha, err := e.objects.PutFile(absPath)
		if err != nil {
			return nil, fmt.Errorf("store %s: %w", rel, err)
		}
		refs = append(refs, cache.OutputRef{Path: rel, Object: sha})
	}
	return refs, nil
}

// restoreOutputs copies cached output files back to their locations in pkgDir.
func (e *Executor) restoreOutputs(m *cache.Manifest, pkgDir string) error {
	for _, ref := range m.Outputs {
		dest := filepath.Join(pkgDir, ref.Path)
		if err := e.objects.RestoreFile(ref.Object, dest); err != nil {
			return fmt.Errorf("restore %s: %w", ref.Path, err)
		}
	}
	return nil
}

// expandOutputFiles returns relative paths of files matching patterns in pkgDir.
// Simpler than HashInputs — we don't need a hash, just file paths.
func expandOutputFiles(pkgDir string, patterns []string) ([]string, error) {
	seen := make(map[string]bool)
	for _, pattern := range patterns {
		pattern = strings.TrimPrefix(pattern, "^")
		err := filepath.WalkDir(pkgDir, func(path string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return err
			}
			rel, _ := filepath.Rel(pkgDir, path)
			if matchGlobSimple(pattern, filepath.ToSlash(rel)) {
				seen[rel] = true
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
	}
	var result []string
	for rel := range seen {
		result = append(result, rel)
	}
	return result, nil
}

// matchGlobSimple matches a path against a glob pattern (** supported).
func matchGlobSimple(pattern, path string) bool {
	patParts := strings.Split(filepath.ToSlash(pattern), "/")
	pathParts := strings.Split(path, "/")
	return matchGlobParts(patParts, pathParts)
}

func matchGlobParts(patParts, pathParts []string) bool {
	for len(patParts) > 0 {
		pat := patParts[0]
		patParts = patParts[1:]
		if pat == "**" {
			for i := 0; i <= len(pathParts); i++ {
				if matchGlobParts(patParts, pathParts[i:]) {
					return true
				}
			}
			return false
		}
		if len(pathParts) == 0 {
			return false
		}
		ok, _ := filepath.Match(pat, pathParts[0])
		if !ok {
			return false
		}
		pathParts = pathParts[1:]
	}
	return len(pathParts) == 0
}

// resolveBin finds binary in workspace node_modules/.bin or PATH.
func resolveBin(name, wsRoot string) string {
	// Handle compound commands like "eslint src/" — name is just "eslint".
	candidate := filepath.Join(wsRoot, "node_modules", ".bin", name)
	if _, err := os.Stat(candidate); err == nil {
		return candidate
	}
	if p, err := exec.LookPath(name); err == nil {
		return p
	}
	return name
}

// splitCommand splits a command string into parts, handling simple quoting.
// "eslint src/" → ["eslint", "src/"]
// "tsc --noEmit" → ["tsc", "--noEmit"]
func splitCommand(cmd string) []string {
	var parts []string
	var current strings.Builder
	inQuote := false
	quoteChar := rune(0)

	for _, r := range cmd {
		switch {
		case inQuote && r == quoteChar:
			inQuote = false
		case !inQuote && (r == '\'' || r == '"'):
			inQuote = true
			quoteChar = r
		case !inQuote && r == ' ':
			if current.Len() > 0 {
				parts = append(parts, current.String())
				current.Reset()
			}
		default:
			current.WriteRune(r)
		}
	}
	if current.Len() > 0 {
		parts = append(parts, current.String())
	}
	return parts
}
