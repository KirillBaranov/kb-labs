package engine

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"

	"github.com/kb-labs/devkit/internal/cache"
	"github.com/kb-labs/devkit/internal/config"
	"github.com/kb-labs/devkit/internal/workspace"
)

// RunOptions controls the scheduler behaviour.
type RunOptions struct {
	Tasks       []string // task names to run (in order)
	Packages    []workspace.Package
	NoCache     bool
	LiveOutput  bool // stream stdout/stderr while running (disables parallel output)
	Concurrency int
	WSRoot      string
	CacheRoot   string // path to .kb/devkit/

	// OnResult is called immediately when each (pkg, task) finishes.
	// Called from the scheduler goroutine — must be safe to print to stdout.
	// total is the total number of (pkg, task) nodes scheduled.
	OnResult func(r TaskResult, done, total int)
}

// RunResult is the aggregate result of a scheduler run.
type RunResult struct {
	OK      bool
	Results []TaskResult
}

func (r RunResult) Summary() RunSummary {
	s := RunSummary{Total: len(r.Results)}
	for _, res := range r.Results {
		switch {
		case res.Cached:
			s.Cached++
		case res.OK:
			s.Passed++
		default:
			s.Failed++
		}
	}
	return s
}

// RunSummary is the JSON summary envelope.
type RunSummary struct {
	Total  int `json:"total"`
	Passed int `json:"passed"`
	Failed int `json:"failed"`
	Cached int `json:"cached"`
}

// Run builds the (package × task) DAG and executes it in topological order.
// Packages in the same layer with no inter-task dependencies run in parallel.
func Run(ws *workspace.Workspace, cfg *config.DevkitConfig, opts RunOptions) (RunResult, error) {
	if len(opts.Tasks) == 0 {
		return RunResult{}, fmt.Errorf("no tasks specified")
	}

	pkgs := opts.Packages
	if len(pkgs) == 0 {
		pkgs = ws.Packages
	}

	// Validate all requested tasks exist in config (at least one variant).
	for _, name := range opts.Tasks {
		if _, ok := cfg.Tasks[name]; !ok {
			return RunResult{}, fmt.Errorf("unknown task %q — add it to devkit.yaml tasks: section", name)
		}
	}

	// Init cache.
	cacheRoot := opts.CacheRoot
	if cacheRoot == "" {
		cacheRoot = ".kb/devkit"
	}
	objects, err := cache.NewLocalStore(cacheRoot)
	if err != nil {
		return RunResult{}, fmt.Errorf("cache init: %w", err)
	}
	manifests := cache.NewManifestStore(cacheRoot)
	executor := NewExecutor(objects, manifests, opts.WSRoot, opts.LiveOutput)

	// Build DAG of (pkg, task) nodes — only for packages with a matching variant.
	nodes, err := buildDAG(pkgs, opts.Tasks, cfg, ws)
	if err != nil {
		return RunResult{}, err
	}

	// Concurrency priority: --concurrency flag > devkit.yaml run.concurrency > NumCPU-1.
	// Live output forces 1 to avoid interleaved lines.
	concurrency := opts.Concurrency
	if opts.LiveOutput {
		concurrency = 1
	} else if concurrency <= 0 {
		concurrency = cfg.Run.Concurrency
	}
	if concurrency <= 0 {
		concurrency = runtime.NumCPU()
		if concurrency > 1 {
			concurrency--
		}
	}

	// Execute layer by layer (Kahn's algorithm).
	inDegree := make(map[nodeKey]int, len(nodes))
	revDeps := make(map[nodeKey][]nodeKey)

	for k, n := range nodes {
		if _, ok := inDegree[k]; !ok {
			inDegree[k] = 0
		}
		for _, dep := range n.deps {
			inDegree[k]++
			revDeps[dep] = append(revDeps[dep], k)
		}
	}

	queue := make([]nodeKey, 0)
	for k, deg := range inDegree {
		if deg == 0 {
			queue = append(queue, k)
		}
	}

	total := len(nodes)
	done := 0
	var allResults []TaskResult
	failed := false

	for len(queue) > 0 {
		layer := queue
		queue = nil

		layerResults := runLayer(layer, nodes, executor, cfg, opts.NoCache, concurrency)
		allResults = append(allResults, layerResults...)

		for _, r := range layerResults {
			done++
			if opts.OnResult != nil {
				opts.OnResult(r, done, total)
			}
			if !r.OK && !r.Cached {
				failed = true
			}
		}

		if failed {
			break
		}

		for _, k := range layer {
			for _, dependent := range revDeps[k] {
				inDegree[dependent]--
				if inDegree[dependent] == 0 {
					queue = append(queue, dependent)
				}
			}
		}
	}

	ok := true
	for _, r := range allResults {
		if !r.OK && !r.Cached {
			ok = false
			break
		}
	}

	return RunResult{OK: ok, Results: allResults}, nil
}

// ─── DAG construction ─────────────────────────────────────────────────────────

type nodeKey struct {
	pkg  string // package name
	task string
}

type dagNode struct {
	pkg  workspace.Package
	task string
	deps []nodeKey
}

func buildDAG(
	pkgs []workspace.Package,
	taskNames []string,
	cfg *config.DevkitConfig,
	ws *workspace.Workspace,
) (map[nodeKey]dagNode, error) {
	// Build package name → Package map.
	pkgByName := make(map[string]workspace.Package, len(pkgs))
	for _, p := range pkgs {
		pkgByName[p.Name] = p
	}

	// Build dep map: pkg name → list of workspace dep names.
	pkgDeps := buildPkgDepMap(pkgs, pkgByName)

	nodes := make(map[nodeKey]dagNode)

	// Create a node for every (pkg, task) pair where a variant matches the pkg category.
	for _, p := range pkgs {
		for _, taskName := range taskNames {
			def := ResolveTaskDef(cfg, taskName, p.Category)
			if def == nil {
				// No variant for this package category — skip silently.
				continue
			}
			k := nodeKey{p.Name, taskName}
			nodes[k] = dagNode{pkg: p, task: taskName}
		}
	}

	// Resolve deps for each node.
	for k, n := range nodes {
		def := ResolveTaskDef(cfg, k.task, n.pkg.Category)
		if def == nil {
			continue
		}
		var deps []nodeKey

		for _, dep := range def.Deps {
			if strings.HasPrefix(dep, "^") {
				// ^build = run 'build' for every workspace dependency first.
				depTask := strings.TrimPrefix(dep, "^")
				for _, depPkgName := range pkgDeps[k.pkg] {
					if _, exists := pkgByName[depPkgName]; exists {
						depKey := nodeKey{depPkgName, depTask}
						if _, hasNode := nodes[depKey]; hasNode {
							deps = append(deps, depKey)
						}
					}
				}
			} else {
				// "build" = run 'build' for this same package first.
				depKey := nodeKey{k.pkg, dep}
				if _, hasNode := nodes[depKey]; hasNode {
					deps = append(deps, depKey)
				}
			}
		}

		n.deps = deps
		nodes[k] = n
	}

	return nodes, nil
}

// buildPkgDepMap reads package.json deps for each package.
// Returns: pkg name → list of workspace dep names.
// Self-references (package depending on itself) are filtered out to prevent
// cycles in the DAG — e.g. @kb-labs/devkit listing itself in devDependencies.
func buildPkgDepMap(pkgs []workspace.Package, pkgByName map[string]workspace.Package) map[string][]string {
	result := make(map[string][]string, len(pkgs))
	for _, p := range pkgs {
		raw := readWorkspaceDeps(p.Dir, pkgByName)
		filtered := raw[:0]
		for _, dep := range raw {
			if dep != p.Name {
				filtered = append(filtered, dep)
			}
		}
		result[p.Name] = filtered
	}
	return result
}

// readWorkspaceDeps returns workspace-internal dependency names for a package.
// Reads dependencies, devDependencies, and peerDependencies — all three are
// relevant for build-time ordering (devDeps like @kb-labs/devkit are needed
// during the build phase inside Docker containers).
func readWorkspaceDeps(dir string, pkgByName map[string]workspace.Package) []string {
	data, err := os.ReadFile(dir + "/package.json")
	if err != nil {
		return nil
	}

	var pkg struct {
		Dependencies     map[string]string `json:"dependencies"`
		DevDependencies  map[string]string `json:"devDependencies"`
		PeerDependencies map[string]string `json:"peerDependencies"`
	}
	if err := json.Unmarshal(data, &pkg); err != nil {
		return nil
	}

	seen := make(map[string]struct{})
	var result []string
	for name := range pkg.Dependencies {
		if _, ok := pkgByName[name]; ok {
			seen[name] = struct{}{}
			result = append(result, name)
		}
	}
	for name := range pkg.DevDependencies {
		if _, ok := pkgByName[name]; ok {
			if _, dup := seen[name]; !dup {
				seen[name] = struct{}{}
				result = append(result, name)
			}
		}
	}
	for name := range pkg.PeerDependencies {
		if _, ok := pkgByName[name]; ok {
			if _, dup := seen[name]; !dup {
				result = append(result, name)
			}
		}
	}
	return result
}

// WorkspaceDeps returns direct workspace:* dependency names for a package dir.
// Reads dependencies + devDependencies + peerDependencies.
// pkgByName must cover all workspace packages to correctly filter internal deps.
func WorkspaceDeps(pkgDir string, pkgByName map[string]workspace.Package) []string {
	return readWorkspaceDeps(pkgDir, pkgByName)
}

// WorkspaceProdDeps returns direct workspace:* dependency names for a package dir,
// excluding devDependencies. Used by bundle --prod to build minimal Docker closures.
func WorkspaceProdDeps(pkgDir string, pkgByName map[string]workspace.Package) []string {
	data, err := os.ReadFile(pkgDir + "/package.json")
	if err != nil {
		return nil
	}

	var pkg struct {
		Dependencies     map[string]string `json:"dependencies"`
		PeerDependencies map[string]string `json:"peerDependencies"`
	}
	if err := json.Unmarshal(data, &pkg); err != nil {
		return nil
	}

	seen := make(map[string]struct{})
	var result []string
	for name := range pkg.Dependencies {
		if _, ok := pkgByName[name]; ok {
			seen[name] = struct{}{}
			result = append(result, name)
		}
	}
	for name := range pkg.PeerDependencies {
		if _, ok := pkgByName[name]; ok {
			if _, dup := seen[name]; !dup {
				result = append(result, name)
			}
		}
	}
	return result
}

// ─── Layer execution ──────────────────────────────────────────────────────────

func runLayer(
	layer []nodeKey,
	nodes map[nodeKey]dagNode,
	executor *Executor,
	cfg *config.DevkitConfig,
	noCache bool,
	concurrency int,
) []TaskResult {
	results := make([]TaskResult, len(layer))
	var wg sync.WaitGroup
	sem := make(chan struct{}, concurrency)

	for i, k := range layer {
		i, k := i, k
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			n := nodes[k]
			def := ResolveTaskDef(cfg, k.task, n.pkg.Category)
			if def == nil {
				// Should not happen — node was created only if variant matched.
				results[i] = TaskResult{Package: k.pkg, Task: k.task, OK: false, Error: "no variant matched"}
				return
			}
			results[i] = executor.Run(n.pkg, *def, noCache)
		}()
	}

	wg.Wait()
	return results
}

// ─── Affected packages ────────────────────────────────────────────────────────

// AffectedPackages returns all packages affected by current changes:
// directly changed packages + all their downstream dependents (BFS).
//
// Strategy is controlled by cfg.Affected.Strategy (default: "git").
//   git        — single `git diff --name-only HEAD` from ws root
//   submodules — walks .gitmodules, runs git diff inside each submodule
//   command    — runs cfg.Affected.Command, reads file paths from stdout
func AffectedPackages(ws *workspace.Workspace, cfg *config.DevkitConfig) ([]workspace.Package, error) {
	strategy := cfg.Affected.Strategy
	if strategy == "" {
		strategy = "git"
	}

	changedFiles, err := collectChangedFiles(ws.Root, strategy, cfg.Affected.Command)
	if err != nil {
		return nil, fmt.Errorf("affected: collect changed files: %w", err)
	}

	directlyChanged := make(map[string]bool)
	for _, absFile := range changedFiles {
		if pkg, ok := ws.PackageByPath(absFile); ok {
			directlyChanged[pkg.Name] = true
		}
	}

	if len(directlyChanged) == 0 {
		return nil, nil
	}

	// Build reverse dep graph: pkg → list of packages that depend on it.
	pkgByName := make(map[string]workspace.Package, len(ws.Packages))
	for _, p := range ws.Packages {
		pkgByName[p.Name] = p
	}

	// reverseDeps[A] = [B, C] means B and C depend on A.
	reverseDeps := make(map[string][]string, len(ws.Packages))
	for _, p := range ws.Packages {
		deps := readWorkspaceDeps(p.Dir, pkgByName)
		for _, dep := range deps {
			reverseDeps[dep] = append(reverseDeps[dep], p.Name)
		}
	}

	// BFS from directly changed packages through reverse dep graph.
	visited := make(map[string]bool)
	queue := make([]string, 0, len(directlyChanged))
	for name := range directlyChanged {
		if !visited[name] {
			visited[name] = true
			queue = append(queue, name)
		}
	}
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		for _, dependent := range reverseDeps[current] {
			if !visited[dependent] {
				visited[dependent] = true
				queue = append(queue, dependent)
			}
		}
	}

	// Collect results preserving workspace order.
	var result []workspace.Package
	for _, p := range ws.Packages {
		if visited[p.Name] {
			result = append(result, p)
		}
	}
	return result, nil
}

// collectChangedFiles returns absolute paths of changed files using the given strategy.
func collectChangedFiles(wsRoot, strategy, command string) ([]string, error) {
	switch strategy {
	case "git":
		return gitChangedFiles(wsRoot, wsRoot)
	case "submodules":
		return submoduleChangedFiles(wsRoot)
	case "command":
		if command == "" {
			return nil, fmt.Errorf("affected.strategy=command requires affected.command to be set")
		}
		return commandChangedFiles(wsRoot, command)
	default:
		return nil, fmt.Errorf("unknown affected.strategy %q (valid: git, submodules, command)", strategy)
	}
}

// gitChangedFiles runs `git diff --name-only HEAD` in dir and returns absolute paths.
func gitChangedFiles(wsRoot, dir string) ([]string, error) {
	cmd := exec.Command("git", "diff", "--name-only", "HEAD")
	cmd.Dir = dir
	out, err := cmd.Output()
	if err != nil {
		// Also try staged files (for fresh repos with no HEAD)
		cmd2 := exec.Command("git", "diff", "--name-only", "--cached")
		cmd2.Dir = dir
		out2, err2 := cmd2.Output()
		if err2 != nil {
			return nil, err // return original error
		}
		out = out2
	}

	// Also include unstaged changes
	cmd3 := exec.Command("git", "diff", "--name-only")
	cmd3.Dir = dir
	if out3, err3 := cmd3.Output(); err3 == nil {
		out = append(out, out3...)
	}

	return parseFileList(wsRoot, dir, out), nil
}

// submoduleChangedFiles reads .gitmodules to find submodule roots,
// then runs git diff inside each one.
func submoduleChangedFiles(wsRoot string) ([]string, error) {
	roots, err := readSubmoduleRoots(wsRoot)
	if err != nil || len(roots) == 0 {
		// Fall back to single git diff in ws root
		return gitChangedFiles(wsRoot, wsRoot)
	}

	var all []string
	for _, root := range roots {
		files, err := gitChangedFiles(wsRoot, root)
		if err != nil {
			continue // skip repos with no commits yet
		}
		all = append(all, files...)
	}
	return all, nil
}

// commandChangedFiles executes a custom command and reads file paths from stdout.
func commandChangedFiles(wsRoot, command string) ([]string, error) {
	parts := strings.Fields(command)
	if len(parts) == 0 {
		return nil, fmt.Errorf("empty command")
	}
	cmd := exec.Command(parts[0], parts[1:]...)
	cmd.Dir = wsRoot
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("command %q failed: %w", command, err)
	}
	return parseFileList(wsRoot, wsRoot, out), nil
}

// readSubmoduleRoots parses .gitmodules to find submodule absolute paths.
func readSubmoduleRoots(wsRoot string) ([]string, error) {
	data, err := os.ReadFile(wsRoot + "/.gitmodules")
	if err != nil {
		return nil, err
	}
	var roots []string
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "path = ") {
			rel := strings.TrimPrefix(line, "path = ")
			abs := wsRoot + "/" + strings.TrimSpace(rel)
			roots = append(roots, abs)
		}
	}
	return roots, nil
}

// parseFileList converts raw `git diff --name-only` output to absolute paths.
// Lines that are relative are resolved against repoRoot.
// Lines that are already absolute are used as-is.
func parseFileList(wsRoot, repoRoot string, raw []byte) []string {
	var result []string
	seen := make(map[string]bool)
	for _, line := range strings.Split(strings.TrimSpace(string(raw)), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var abs string
		if strings.HasPrefix(line, "/") {
			abs = line
		} else {
			abs = repoRoot + "/" + line
		}
		if !seen[abs] {
			seen[abs] = true
			result = append(result, abs)
		}
	}
	_ = wsRoot // available for future use (e.g. relative path normalization)
	return result
}
