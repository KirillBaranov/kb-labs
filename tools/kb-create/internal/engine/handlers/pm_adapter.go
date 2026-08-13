package handlers

import (
	"context"
	"fmt"

	"github.com/kb-labs/create/internal/pm"
)

// PMAdapter bridges the existing npm/pnpm abstraction into the new executor.
// It is intentionally an adapter, not a dependency from engine core to the
// legacy installer lifecycle.
type PMAdapter struct {
	Manager  pm.PackageManager
	Dir      string
	Progress func(pm.Progress)
}

func (a *PMAdapter) Installed(_ context.Context, packageSpec string) (bool, error) {
	if a.Manager == nil || a.Dir == "" {
		return false, fmt.Errorf("package manager adapter is not configured")
	}
	installed, err := a.Manager.ListInstalled(a.Dir)
	if err != nil {
		return false, err
	}
	for _, item := range installed {
		if item.Name == packageName(packageSpec) {
			return true, nil
		}
	}
	return false, nil
}

func (a *PMAdapter) Install(ctx context.Context, packageSpec string) error {
	return a.InstallMany(ctx, []string{packageSpec})
}

func (a *PMAdapter) Update(ctx context.Context, packageSpec string) error {
	return a.UpdateMany(ctx, []string{packageSpec})
}

func (a *PMAdapter) InstallMany(ctx context.Context, packageSpecs []string) error {
	return a.run(ctx, packageSpecs, false)
}

func (a *PMAdapter) UpdateMany(ctx context.Context, packageSpecs []string) error {
	return a.run(ctx, packageSpecs, true)
}

func (a *PMAdapter) run(ctx context.Context, packageSpecs []string, update bool) error {
	if a.Manager == nil || a.Dir == "" {
		return fmt.Errorf("package manager adapter is not configured")
	}
	progress := make(chan pm.Progress)
	result := make(chan error, 1)
	go func() {
		if update {
			result <- a.Manager.Update(a.Dir, packageSpecs, progress)
			return
		}
		result <- a.Manager.Install(a.Dir, packageSpecs, progress)
	}()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case event, ok := <-progress:
			if !ok {
				progress = nil
				continue
			}
			if a.Progress != nil {
				a.Progress(event)
			}
			if event.Error != nil {
				return event.Error
			}
		case err := <-result:
			return err
		}
	}
}

func packageName(spec string) string {
	if len(spec) == 0 {
		return spec
	}
	for i, char := range spec {
		if char == '@' && i > 0 {
			return spec[:i]
		}
	}
	return spec
}
