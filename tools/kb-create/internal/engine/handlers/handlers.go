// Package handlers contains side-effect adapters for the declarative executor.
// The interfaces are intentionally small so the legacy package manager and
// platform runtime can be wrapped during the eventual cutover.
package handlers

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/kb-labs/create/internal/engine/config"
	"github.com/kb-labs/create/internal/engine/executor"
	"github.com/kb-labs/create/internal/engine/plan"
)

type PackageManager interface {
	Installed(context.Context, string) (bool, error)
	Install(context.Context, string) error
}

type PackageUpdater interface {
	Update(context.Context, string) error
}

type ProviderBinder interface {
	Bound(context.Context, string, string) (bool, error)
	Bind(context.Context, string, string, string) error
}

// Materializer owns post-package installation outputs (binaries, discovered
// manifests, service registry, marketplace lock, and project bootstrap).
// The executor controls when it runs; product code only supplies this port.
type Materializer interface {
	Materialize(context.Context, plan.InstallPlan) error
}

type RegistryOptions struct {
	Packages     PackageManager
	Providers    ProviderBinder
	Assembly     config.ConfigAssembly
	Roots        config.Roots
	BaseConfig   []byte
	Materializer Materializer
	Plan         plan.InstallPlan
}

func Registry(options RegistryOptions) executor.HandlerRegistry {
	return executor.HandlerRegistry{
		plan.ActionInstallPackage: &packageHandler{manager: options.Packages},
		plan.ActionBindProvider:   &providerHandler{binder: options.Providers},
		plan.ActionWriteConfig:    &configHandler{assembly: options.Assembly, roots: options.Roots, base: options.BaseConfig},
		plan.ActionMaterialize:    &materializeHandler{materializer: options.Materializer, compiled: options.Plan},
	}
}

type materializeHandler struct {
	materializer Materializer
	compiled     plan.InstallPlan
}

func (h *materializeHandler) Check(context.Context, plan.PlanAction) (bool, error) {
	return false, nil
}

func (h *materializeHandler) Apply(ctx context.Context, action plan.PlanAction) (executor.ActionResult, error) {
	if h.materializer == nil {
		return executor.ActionResult{}, fmt.Errorf("install materializer is not configured")
	}
	if err := h.materializer.Materialize(ctx, h.compiled); err != nil {
		return executor.ActionResult{}, err
	}
	return executor.ActionResult{}, nil
}

func (h *materializeHandler) Verify(context.Context, plan.PlanAction, executor.ActionResult) error {
	return nil
}

type packageHandler struct{ manager PackageManager }

func (h *packageHandler) Check(ctx context.Context, action plan.PlanAction) (bool, error) {
	if h.manager == nil {
		return false, fmt.Errorf("package manager is not configured")
	}
	if action.Inputs["mode"] == "update" {
		return false, nil
	}
	for _, pkg := range packageSpecs(action) {
		installed, err := h.manager.Installed(ctx, pkg)
		if err != nil || !installed {
			return false, err
		}
	}
	return true, nil
}
func (h *packageHandler) Apply(ctx context.Context, action plan.PlanAction) (executor.ActionResult, error) {
	if h.manager == nil {
		return executor.ActionResult{}, fmt.Errorf("package manager is not configured")
	}
	var err error
	if action.Inputs["mode"] == "update" {
		updater, ok := h.manager.(PackageUpdater)
		if !ok {
			return executor.ActionResult{}, fmt.Errorf("package manager does not support updates")
		}
		err = updatePackages(ctx, updater, packageSpecs(action))
	} else {
		err = installPackages(ctx, h.manager, packageSpecs(action))
	}
	if err != nil {
		return executor.ActionResult{}, err
	}
	return executor.ActionResult{}, nil
}
func (h *packageHandler) Verify(ctx context.Context, action plan.PlanAction, _ executor.ActionResult) error {
	if h.manager == nil {
		return fmt.Errorf("package manager is not configured")
	}
	for _, pkg := range packageSpecs(action) {
		installed, err := h.manager.Installed(ctx, pkg)
		if err != nil {
			return err
		}
		if !installed {
			return fmt.Errorf("package %q is not installed after apply", pkg)
		}
	}
	return nil
}

func packageSpecs(action plan.PlanAction) []string {
	if encoded := action.Inputs["packages"]; encoded != "" {
		return strings.Split(encoded, "\n")
	}
	if pkg := action.Inputs["package"]; pkg != "" {
		return []string{pkg}
	}
	return nil
}

func installPackages(ctx context.Context, manager PackageManager, packages []string) error {
	if len(packages) == 0 {
		return fmt.Errorf("package install action has no packages")
	}
	if batch, ok := manager.(interface {
		InstallMany(context.Context, []string) error
	}); ok {
		return batch.InstallMany(ctx, packages)
	}
	for _, pkg := range packages {
		if err := manager.Install(ctx, pkg); err != nil {
			return err
		}
	}
	return nil
}

func updatePackages(ctx context.Context, manager PackageUpdater, packages []string) error {
	if len(packages) == 0 {
		return fmt.Errorf("package update action has no packages")
	}
	if batch, ok := manager.(interface {
		UpdateMany(context.Context, []string) error
	}); ok {
		return batch.UpdateMany(ctx, packages)
	}
	for _, pkg := range packages {
		if err := manager.Update(ctx, pkg); err != nil {
			return err
		}
	}
	return nil
}

type providerHandler struct{ binder ProviderBinder }

func (h *providerHandler) Check(ctx context.Context, action plan.PlanAction) (bool, error) {
	if h.binder == nil {
		return false, fmt.Errorf("provider binder is not configured")
	}
	return h.binder.Bound(ctx, action.Inputs["capability"], action.Inputs["provider"])
}
func (h *providerHandler) Apply(ctx context.Context, action plan.PlanAction) (executor.ActionResult, error) {
	if h.binder == nil {
		return executor.ActionResult{}, fmt.Errorf("provider binder is not configured")
	}
	if err := h.binder.Bind(ctx, action.Inputs["capability"], action.Inputs["provider"], action.Inputs["package"]); err != nil {
		return executor.ActionResult{}, err
	}
	return executor.ActionResult{}, nil
}
func (h *providerHandler) Verify(ctx context.Context, action plan.PlanAction, _ executor.ActionResult) error {
	if h.binder == nil {
		return fmt.Errorf("provider binder is not configured")
	}
	bound, err := h.binder.Bound(ctx, action.Inputs["capability"], action.Inputs["provider"])
	if err != nil {
		return err
	}
	if !bound {
		return fmt.Errorf("provider %q is not bound after apply", action.Inputs["provider"])
	}
	return nil
}

type configHandler struct {
	assembly config.ConfigAssembly
	roots    config.Roots
	base     []byte
}

func (h *configHandler) materialize() (config.Result, error) {
	return config.Assemble(h.assembly, h.roots, h.base)
}
func (h *configHandler) Check(_ context.Context, _ plan.PlanAction) (bool, error) {
	result, err := h.materialize()
	if err != nil {
		return false, err
	}
	for _, artifact := range result.Artifacts {
		data, readErr := os.ReadFile(artifact.Path) // #nosec G304 -- path was root-validated by config.Assemble.
		if readErr != nil || string(data) != string(artifact.Content) {
			return false, nil
		}
	}
	return true, nil
}
func (h *configHandler) Apply(_ context.Context, _ plan.PlanAction) (executor.ActionResult, error) {
	result, err := h.materialize()
	if err != nil {
		return executor.ActionResult{}, err
	}
	if err := config.Write(result, h.assembly, h.roots); err != nil {
		return executor.ActionResult{}, err
	}
	return executor.ActionResult{}, nil
}
func (h *configHandler) Verify(_ context.Context, _ plan.PlanAction, _ executor.ActionResult) error {
	result, err := h.materialize()
	if err != nil {
		return err
	}
	for _, artifact := range result.Artifacts {
		if artifact.Mode == config.OverwriteCreateOnly {
			if _, readErr := os.Stat(artifact.Path); readErr == nil {
				continue
			}
		}
		data, readErr := os.ReadFile(filepath.Clean(artifact.Path)) // #nosec G304 -- path was root-validated by config.Assemble.
		if readErr != nil {
			return readErr
		}
		if string(data) != string(artifact.Content) {
			return fmt.Errorf("artifact %q failed read-back verification", artifact.Path)
		}
	}
	return nil
}
