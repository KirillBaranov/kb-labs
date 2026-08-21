// Package runtime is the side-effectful boundary for the declarative engine.
// Commands assemble a request and roots; this package wires the common plan
// executor to concrete adapters without making product decisions.
package runtime

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	engineconfig "github.com/kb-labs/create/internal/engine/config"
	"github.com/kb-labs/create/internal/engine/executor"
	"github.com/kb-labs/create/internal/engine/handlers"
	"github.com/kb-labs/create/internal/engine/plan"
	"github.com/kb-labs/create/internal/pm"
)

type Options struct {
	PackageManager pm.PackageManager
	BaseConfig     []byte
	JournalDir     string
	LockPath       string
	DryRun         bool
	Rollback       bool
	Progress       func(pm.Progress)
	Emit           func(executor.Event)
	Materializer   handlers.Materializer
}

func Apply(ctx context.Context, compiled plan.InstallPlan, options Options) (executor.Journal, error) {
	if compiled.PlatformRoot == "" {
		return executor.Journal{}, fmt.Errorf("platform root is required")
	}
	if err := os.MkdirAll(compiled.PlatformRoot, 0o750); err != nil {
		return executor.Journal{}, fmt.Errorf("platform destination %q is not writable: %w", compiled.PlatformRoot, err)
	}
	base := options.BaseConfig
	if base == nil {
		path := filepath.Join(compiled.PlatformRoot, ".kb", "kb.config.jsonc")
		data, err := os.ReadFile(path)
		if err == nil {
			base = data
		} else if !os.IsNotExist(err) {
			return executor.Journal{}, err
		}
	}
	manager := options.PackageManager
	if manager == nil {
		manager = pm.Detect()
	}
	registry := handlers.Registry(handlers.RegistryOptions{
		Packages:  &handlers.PMAdapter{Manager: manager, Dir: compiled.PlatformRoot, Progress: options.Progress},
		Providers: handlers.FileProviderBinder{Root: filepath.Join(compiled.PlatformRoot, ".kb", "kb-create", "providers")},
		Assembly:  compiled.Assembly,
		Roots: engineconfig.Roots{
			engineconfig.RootPlatform: compiled.PlatformRoot,
			engineconfig.RootProject:  compiled.ProjectRoot,
		},
		BaseConfig:   base,
		Materializer: options.Materializer,
		Plan:         compiled,
	})
	return executor.Run(ctx, compiled, registry, executor.Options{
		DryRun:            options.DryRun,
		RollbackOnFailure: options.Rollback,
		Emit:              options.Emit,
		Store:             executor.FileJournalStore{Dir: options.JournalDir},
		Lock:              executor.FileLock{Path: options.LockPath},
	})
}
