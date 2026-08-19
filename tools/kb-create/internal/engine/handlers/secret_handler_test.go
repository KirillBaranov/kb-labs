package handlers

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kb-labs/create/internal/engine/config"
	"github.com/kb-labs/create/internal/engine/executor"
	"github.com/kb-labs/create/internal/engine/plan"
	"github.com/kb-labs/create/internal/engine/secrets"
)

func TestSecretHandler_GeneratesAndPersists(t *testing.T) {
	dir := t.TempDir()
	store := secrets.EnvFileStore{Path: filepath.Join(dir, ".env")}
	h := &secretHandler{
		requirements: []config.SecretRequirement{{ID: "gateway.bootstrap.adminPassword", EnvVar: "GATEWAY_BOOTSTRAP_ADMIN_PASSWORD", Generator: config.SecretGeneratorRandomHex32}},
		store:        store,
	}
	action := plan.PlanAction{ID: "secret:gateway.bootstrap.adminPassword", Kind: plan.ActionWriteSecret, Inputs: map[string]string{"id": "gateway.bootstrap.adminPassword"}}

	ready, err := h.Check(context.Background(), action)
	if err != nil {
		t.Fatalf("Check() error = %v", err)
	}
	if ready {
		t.Fatal("Check() = true before Apply, want false (no value yet)")
	}

	if _, err := h.Apply(context.Background(), action); err != nil {
		t.Fatalf("Apply() error = %v", err)
	}
	if err := h.Verify(context.Background(), action, executor.ActionResult{}); err != nil {
		t.Fatalf("Verify() error = %v", err)
	}

	value, err := store.Get(context.Background(), secrets.Ref{Name: "GATEWAY_BOOTSTRAP_ADMIN_PASSWORD"})
	if err != nil || len(value) != 64 { // 32 random bytes, hex-encoded
		t.Fatalf("stored value = %q (len %d), err = %v", value, len(value), err)
	}

	info, err := os.Stat(filepath.Join(dir, ".env"))
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Errorf(".env mode = %o, want 0600", info.Mode().Perm())
	}
}

// TestSecretHandler_NeverRotatesExistingValue is the regression this whole
// mechanism exists to prevent: re-running install/update against a platform
// that already has a bootstrap admin provisioned under the current password
// must never generate a new one and silently lock the admin out.
func TestSecretHandler_NeverRotatesExistingValue(t *testing.T) {
	dir := t.TempDir()
	store := secrets.EnvFileStore{Path: filepath.Join(dir, ".env")}
	if err := store.Put(context.Background(), secrets.Ref{Name: "GATEWAY_BOOTSTRAP_ADMIN_PASSWORD"}, "existing-value"); err != nil {
		t.Fatal(err)
	}
	h := &secretHandler{
		requirements: []config.SecretRequirement{{ID: "gateway.bootstrap.adminPassword", EnvVar: "GATEWAY_BOOTSTRAP_ADMIN_PASSWORD", Generator: config.SecretGeneratorRandomHex32}},
		store:        store,
	}
	action := plan.PlanAction{Inputs: map[string]string{"id": "gateway.bootstrap.adminPassword"}}

	ready, err := h.Check(context.Background(), action)
	if err != nil {
		t.Fatalf("Check() error = %v", err)
	}
	if !ready {
		t.Fatal("Check() = false with an existing value, want true (already satisfied, executor must skip Apply)")
	}
}

func TestSecretHandler_UnknownRequirement(t *testing.T) {
	h := &secretHandler{store: secrets.EnvFileStore{Path: t.TempDir() + "/.env"}}
	action := plan.PlanAction{Inputs: map[string]string{"id": "does-not-exist"}}
	if _, err := h.Check(context.Background(), action); err == nil {
		t.Fatal("Check() with unknown requirement id should error")
	}
}

func TestGenerateSecret_UnknownGeneratorRejected(t *testing.T) {
	if _, err := generateSecret("not-a-real-generator"); err == nil {
		t.Fatal("generateSecret with an unknown generator name should error, not silently produce a value")
	}
}

func TestRegistry_DefaultsSecretStoreToProjectDotenv(t *testing.T) {
	platform := t.TempDir()
	project := t.TempDir()
	packages := &fakePackages{installed: map[string]bool{}}
	assembly := config.ConfigAssembly{
		Outputs: []config.ConfigOutput{{Scope: config.ScopePlatform, Path: ".kb/kb.config.jsonc", Format: config.FormatJSONC}},
		Secrets: []config.SecretRequirement{{ID: "s1", EnvVar: "TEST_SECRET", Generator: config.SecretGeneratorRandomHex32}},
	}
	compiled := plan.InstallPlan{PlanHash: "hash", Assembly: assembly, Actions: []plan.PlanAction{
		{ID: "secret:s1", Kind: plan.ActionWriteSecret, Inputs: map[string]string{"id": "s1"}},
		{ID: "config:runtime", Kind: plan.ActionWriteConfig, DependsOn: []string{"secret:s1"}},
	}}
	registry := Registry(RegistryOptions{
		Packages: packages,
		Assembly: assembly,
		Roots:    config.Roots{config.RootPlatform: platform, config.RootProject: project},
	})
	if _, err := executor.Run(context.Background(), compiled, registry, executor.Options{}); err != nil {
		t.Fatalf("executor run error = %v", err)
	}
	data, err := os.ReadFile(filepath.Join(project, ".env"))
	if err != nil {
		t.Fatalf("read .env: %v", err)
	}
	if !strings.Contains(string(data), "TEST_SECRET=") {
		t.Errorf(".env missing TEST_SECRET, got:\n%s", data)
	}
}
