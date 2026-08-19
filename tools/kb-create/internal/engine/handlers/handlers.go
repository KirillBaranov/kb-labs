// Package handlers contains side-effect adapters for the declarative executor.
// The interfaces are intentionally small so the legacy package manager and
// platform runtime can be wrapped during the eventual cutover.
package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/kb-labs/create/internal/engine/config"
	"github.com/kb-labs/create/internal/engine/executor"
	"github.com/kb-labs/create/internal/engine/plan"
	"github.com/kb-labs/create/internal/engine/secrets"
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

type RegistryOptions struct {
	Packages   PackageManager
	Providers  ProviderBinder
	Assembly   config.ConfigAssembly
	Roots      config.Roots
	BaseConfig []byte
	// Secrets stores generated secret values (e.g. the gateway bootstrap
	// admin password) — defaults to a dotenv file at Roots[RootProject]/.env
	// when nil, matching where kb-create has always kept project secrets.
	Secrets secrets.Store
}

func Registry(options RegistryOptions) executor.HandlerRegistry {
	secretStore := options.Secrets
	platformDir := options.Roots[config.RootPlatform]
	if secretStore == nil {
		if projectRoot := options.Roots[config.RootProject]; projectRoot != "" {
			secretStore = secrets.EnvFileStore{Path: filepath.Join(projectRoot, ".env")}
		}
	}
	gatewayPatches := new([]config.ConfigPatch)
	return executor.HandlerRegistry{
		plan.ActionInstallPackage:   &packageHandler{manager: options.Packages},
		plan.ActionBindProvider:     &providerHandler{binder: options.Providers},
		plan.ActionWriteConfig:      &configHandler{assembly: options.Assembly, roots: options.Roots, base: options.BaseConfig, extraPatches: gatewayPatches},
		plan.ActionWriteSecret:      &secretHandler{requirements: options.Assembly.Secrets, store: secretStore},
		plan.ActionDiscoverServices: &discoveryHandler{platformDir: platformDir, projectDir: options.Roots[config.RootProject], gatewayPatches: gatewayPatches},
		plan.ActionInstallBinary:    &binaryHandler{platformDir: platformDir},
	}
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
	// extraPatches is the same pointer discoveryHandler writes into — see
	// discoveryHandler.gatewayPatches. Read fresh on every materialize() call
	// (not copied in once at construction) because discover:services'
	// DependsOn guarantees it has already run and populated this by the time
	// config:runtime's Apply/Check/Verify execute, but Check may run before
	// Apply in the same executor pass — always re-reading avoids relying on
	// call-order assumptions beyond that one DependsOn guarantee.
	extraPatches *[]config.ConfigPatch
}

func (h *configHandler) effectiveAssembly() config.ConfigAssembly {
	if h.extraPatches == nil || len(*h.extraPatches) == 0 {
		return h.assembly
	}
	assembly := h.assembly
	assembly.Patches = append(append([]config.ConfigPatch(nil), assembly.Patches...), *h.extraPatches...)
	return assembly
}

func (h *configHandler) materialize() (config.Result, error) {
	return config.Assemble(h.effectiveAssembly(), h.roots, h.base)
}
func (h *configHandler) Check(_ context.Context, _ plan.PlanAction) (bool, error) {
	result, err := h.materialize()
	if err != nil {
		return false, err
	}
	for _, artifact := range result.Artifacts {
		data, readErr := os.ReadFile(artifact.Path) // #nosec G304 -- path was root-validated by config.Assemble.
		if readErr != nil || !artifactMatches(data, artifact, h.effectiveAssembly()) {
			return false, nil
		}
	}
	return true, nil
}
func (h *configHandler) Apply(_ context.Context, _ plan.PlanAction) (executor.ActionResult, error) {
	assembly := h.effectiveAssembly()
	result, err := config.Assemble(assembly, h.roots, h.base)
	if err != nil {
		return executor.ActionResult{}, err
	}
	if err := config.Write(result, assembly, h.roots); err != nil {
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
		if !artifactMatches(data, artifact, h.effectiveAssembly()) {
			return fmt.Errorf("artifact %q failed read-back verification", artifact.Path)
		}
	}
	return nil
}

func artifactMatches(actual []byte, artifact config.MaterializedArtifact, assembly config.ConfigAssembly) bool {
	if artifact.Mode != config.OverwriteMerge {
		return string(actual) == string(artifact.Content)
	}
	for _, candidate := range assembly.Artifacts {
		if candidate.ID != artifact.ID {
			continue
		}
		return string(actual) == string(mergeArtifactBlock(actual, artifact.Content, candidate.MergeMarker, candidate.MergeEndMarker))
	}
	return false
}

func mergeArtifactBlock(existing, block []byte, marker, endMarker string) []byte {
	content := string(existing)
	if start := strings.Index(content, marker); start >= 0 {
		if end := strings.Index(content[start:], endMarker); end >= 0 {
			end += start + len(endMarker)
			return []byte(content[:start] + string(block) + strings.TrimLeft(content[end:], "\r\n"))
		}
		return []byte(content[:start] + string(block))
	}
	separator := "\n"
	if content == "" || strings.HasSuffix(content, "\n") {
		separator = ""
	}
	return []byte(content + separator + string(block))
}

// secretHandler generates (once) and persists a secret value to a
// project-scoped dotenv file. Idempotent by design: Check reports "already
// satisfied" whenever a non-empty value already exists under EnvVar, so
// re-running install/update never rotates a secret out from under an
// already-provisioned consumer (e.g. a gateway that already seeded its
// bootstrap admin under the current password).
type secretHandler struct {
	requirements []config.SecretRequirement
	store        secrets.Store
}

func (h *secretHandler) find(action plan.PlanAction) (config.SecretRequirement, bool) {
	id := action.Inputs["id"]
	for _, r := range h.requirements {
		if r.ID == id {
			return r, true
		}
	}
	return config.SecretRequirement{}, false
}

func (h *secretHandler) Check(ctx context.Context, action plan.PlanAction) (bool, error) {
	if h.store == nil {
		return false, fmt.Errorf("secret store is not configured")
	}
	req, ok := h.find(action)
	if !ok {
		return false, fmt.Errorf("unknown secret requirement %q", action.Inputs["id"])
	}
	value, err := h.store.Get(ctx, secrets.Ref{Name: req.EnvVar})
	if err != nil {
		return false, err
	}
	return value != "", nil
}

func (h *secretHandler) Apply(ctx context.Context, action plan.PlanAction) (executor.ActionResult, error) {
	if h.store == nil {
		return executor.ActionResult{}, fmt.Errorf("secret store is not configured")
	}
	req, ok := h.find(action)
	if !ok {
		return executor.ActionResult{}, fmt.Errorf("unknown secret requirement %q", action.Inputs["id"])
	}
	value, err := generateSecret(req.Generator)
	if err != nil {
		return executor.ActionResult{}, err
	}
	if err := h.store.Put(ctx, secrets.Ref{Name: req.EnvVar}, value); err != nil {
		return executor.ActionResult{}, err
	}
	return executor.ActionResult{}, nil
}

func (h *secretHandler) Verify(ctx context.Context, action plan.PlanAction, _ executor.ActionResult) error {
	ok, err := h.Check(ctx, action)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("secret %q was not persisted", action.Inputs["id"])
	}
	return nil
}

// generateSecret produces a value for the given generator. The set of
// generators is closed and Go-implemented — never arbitrary code — per the
// architecture's "no scripts" rule for manifest-declared behavior.
func generateSecret(generator config.SecretGenerator) (string, error) {
	switch generator {
	case config.SecretGeneratorRandomHex32, "":
		b := make([]byte, 32)
		if _, err := rand.Read(b); err != nil {
			return "", fmt.Errorf("generate secret: %w", err)
		}
		return hex.EncodeToString(b), nil
	default:
		return "", fmt.Errorf("unknown secret generator %q", generator)
	}
}
