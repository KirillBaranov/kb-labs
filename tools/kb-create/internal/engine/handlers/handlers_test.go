package handlers

import (
	"context"
	"testing"

	"github.com/kb-labs/create/internal/engine/config"
	"github.com/kb-labs/create/internal/engine/executor"
	"github.com/kb-labs/create/internal/engine/plan"
)

type fakePackages struct {
	installed map[string]bool
	installs  []string
}

func (f *fakePackages) Installed(_ context.Context, pkg string) (bool, error) {
	return f.installed[pkg], nil
}
func (f *fakePackages) Install(_ context.Context, pkg string) error {
	f.installs = append(f.installs, pkg)
	f.installed[pkg] = true
	return nil
}

type fakeProviders struct{ bound map[string]string }

func (f *fakeProviders) Bound(_ context.Context, capability, provider string) (bool, error) {
	return f.bound[capability] == provider, nil
}
func (f *fakeProviders) Bind(_ context.Context, capability, provider, _ string) error {
	f.bound[capability] = provider
	return nil
}

func TestRegistryRunsPackageProviderAndConfigHandlers(t *testing.T) {
	packages := &fakePackages{installed: map[string]bool{}}
	providers := &fakeProviders{bound: map[string]string{}}
	platform := t.TempDir()
	assembly := config.ConfigAssembly{Outputs: []config.ConfigOutput{{Scope: config.ScopePlatform, Path: ".kb/kb.config.jsonc", Format: config.FormatJSONC}}}
	compiled := plan.InstallPlan{PlanHash: "hash", Assembly: assembly, Actions: []plan.PlanAction{
		{ID: "install:commit", Kind: plan.ActionInstallPackage, Inputs: map[string]string{"package": "@kb-labs/commit"}},
		{ID: "bind:cache", Kind: plan.ActionBindProvider, DependsOn: []string{"install:commit"}, Inputs: map[string]string{"capability": "cache", "provider": "redis", "package": "redis"}},
		{ID: "config:runtime", Kind: plan.ActionWriteConfig, DependsOn: []string{"bind:cache"}},
	}}
	journal, err := executor.Run(context.Background(), compiled, Registry(RegistryOptions{Packages: packages, Providers: providers, Assembly: assembly, Roots: config.Roots{config.RootPlatform: platform}}), executor.Options{})
	if err != nil {
		t.Fatal(err)
	}
	if len(journal.Entries) != 3 || len(packages.installs) != 1 || providers.bound["cache"] != "redis" {
		t.Fatalf("journal/packages/providers = %#v / %#v / %#v", journal, packages, providers)
	}
}
