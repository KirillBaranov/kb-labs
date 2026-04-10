package checks

import (
	"sync"

	"github.com/kb-labs/devkit/internal/config"
	"github.com/kb-labs/devkit/internal/workspace"
)

// PackageResult holds all issues for a single package.
type PackageResult struct {
	Package  workspace.Package
	Issues   []Issue
	Skipped  bool
}

// RunAll runs all rules from the registry against all packages in parallel.
// Circular detection runs once on the full graph and is merged in.
func RunAll(ws *workspace.Workspace, cfg *config.DevkitConfig, registry *Registry, only []string) map[string]PackageResult {
	onlySet := make(map[string]bool, len(only))
	for _, name := range only {
		onlySet[name] = true
	}

	// Run circular detection once on full workspace.
	var circularResult CircularResult
	for _, nc := range cfg.Workspace.Categories {
		preset, err := config.ResolvePreset(nc.Category.Preset, cfg)
		if err == nil && preset.Deps.CheckCircular {
			circularResult = DetectCircular(ws.Packages)
			break
		}
	}

	results := make(map[string]PackageResult, len(ws.Packages))
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 8) // max 8 goroutines

	for _, pkg := range ws.Packages {
		pkg := pkg
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			preset, err := config.ResolvePreset(pkg.Preset, cfg)
			if err != nil {
				mu.Lock()
				results[pkg.Name] = PackageResult{Package: pkg, Skipped: true}
				mu.Unlock()
				return
			}

			rules := registry.RulesFor(preset)

			var issues []Issue
			for _, rule := range rules {
				// Apply --only filter.
				if len(onlySet) > 0 && !onlySet[rule.Name()] {
					continue
				}
				issues = append(issues, rule.Check(pkg, preset)...)
			}

			// Merge circular results.
			if circularIssues, ok := circularResult[pkg.Dir]; ok {
				if len(onlySet) == 0 || onlySet["circular"] {
					issues = append(issues, circularIssues...)
				}
			}

			mu.Lock()
			results[pkg.Name] = PackageResult{Package: pkg, Issues: issues}
			mu.Unlock()
		}()
	}

	wg.Wait()
	return results
}
