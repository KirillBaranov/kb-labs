package config

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAssembleBuildsConfigAndArtifactsFromOneState(t *testing.T) {
	platform := t.TempDir()
	project := t.TempDir()
	result, err := Assemble(ConfigAssembly{
		Patches: []ConfigPatch{{
			ID: "platform.adapter.cache", Scope: ScopePlatform, Operation: OperationSet,
			Path: "/platform/adapters/cache", Value: []byte(`"@kb-labs/adapters-redis"`), Owner: "provider.redis",
		}},
		Artifacts: []ArtifactWrite{
			{ID: "platform.config", Root: RootPlatform, Path: ".kb/kb.config.jsonc", Format: FormatJSONC, Content: []byte(`{"platform":{"dir":"/tmp/platform"}}`), Owner: "runtime", Overwrite: OverwriteReplace, Required: true},
			{ID: "project.env", Root: RootProject, Path: ".env", Format: FormatDotenv, Text: "CACHE_URL=redis://localhost\n", Owner: "provider.redis", Overwrite: OverwriteReplace, Permissions: 0o600},
		},
	}, Roots{RootPlatform: platform, RootProject: project}, []byte(`{"platform":{}}`))
	if err != nil {
		t.Fatalf("Assemble() error = %v", err)
	}
	if !strings.Contains(string(result.Config), `"cache": "@kb-labs/adapters-redis"`) {
		t.Fatalf("config patch missing: %s", result.Config)
	}
	if len(result.Artifacts) != 2 {
		t.Fatalf("artifacts = %d, want 2", len(result.Artifacts))
	}
	if result.Artifacts[0].Hash == "" {
		t.Fatal("artifact hash is empty")
	}
	if !strings.HasSuffix(result.Artifacts[0].Path, ".kb/kb.config.jsonc") {
		t.Fatalf("artifacts not sorted or path wrong: %#v", result.Artifacts)
	}

	if err := Write(result, ConfigAssembly{Artifacts: []ArtifactWrite{
		{ID: "platform.config", Root: RootPlatform, Path: ".kb/kb.config.jsonc", Permissions: 0o644},
		{ID: "project.env", Root: RootProject, Path: ".env", Permissions: 0o600},
	}}, Roots{RootPlatform: platform, RootProject: project}); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	if _, err := os.Stat(filepath.Join(platform, ".kb", "kb.config.jsonc")); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(filepath.Join(project, ".env"))
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf(".env mode = %o, want 600", info.Mode().Perm())
	}
}

func TestAssembleRendersConfigOutputAsAnArtifact(t *testing.T) {
	platform := t.TempDir()
	result, err := Assemble(ConfigAssembly{
		Patches: []ConfigPatch{{
			ID: "service.state.enabled", Scope: ScopePlatform, Operation: OperationSet,
			Path: "/services/state/enabled", Value: []byte(`true`), Owner: "service.state",
		}},
		Outputs: []ConfigOutput{{Scope: ScopePlatform, Path: ".kb/kb.config.jsonc", Format: FormatJSONC}},
	}, Roots{RootPlatform: platform}, []byte(`{"services":{}}`))
	if err != nil {
		t.Fatalf("Assemble() error = %v", err)
	}
	if len(result.Artifacts) != 1 || result.Artifacts[0].ID != "config:.kb/kb.config.jsonc" {
		t.Fatalf("config output = %#v", result.Artifacts)
	}
	if !strings.Contains(string(result.Artifacts[0].Content), `"enabled": true`) {
		t.Fatalf("patched config was not materialized: %s", result.Artifacts[0].Content)
	}
}

func TestAssembleRejectsPathEscape(t *testing.T) {
	_, err := Assemble(ConfigAssembly{Artifacts: []ArtifactWrite{{ID: "escape", Root: RootProject, Path: "../outside", Format: FormatText, Text: "x", Owner: "test", Overwrite: OverwriteReplace}}}, Roots{RootProject: t.TempDir()}, nil)
	if !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("error = %v, want ErrInvalidPath", err)
	}
}

func TestAssembleRejectsAbsolutePathAndCollision(t *testing.T) {
	root := t.TempDir()
	_, err := Assemble(ConfigAssembly{Artifacts: []ArtifactWrite{{ID: "absolute", Root: RootProject, Path: filepath.Join(root, "file"), Format: FormatText, Text: "x", Owner: "test", Overwrite: OverwriteReplace}}}, Roots{RootProject: root}, nil)
	if !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("absolute path error = %v, want ErrInvalidPath", err)
	}

	_, err = Assemble(ConfigAssembly{Artifacts: []ArtifactWrite{
		{ID: "one", Root: RootProject, Path: "same", Format: FormatText, Text: "1", Owner: "one", Overwrite: OverwriteReplace},
		{ID: "two", Root: RootProject, Path: "same", Format: FormatText, Text: "2", Owner: "two", Overwrite: OverwriteReplace},
	}}, Roots{RootProject: root}, nil)
	if !errors.Is(err, ErrCollision) {
		t.Fatalf("collision error = %v, want ErrCollision", err)
	}
}

func TestAssembleRejectsMalformedPatch(t *testing.T) {
	_, err := Assemble(ConfigAssembly{Patches: []ConfigPatch{{ID: "bad", Scope: ScopePlatform, Operation: OperationSet, Path: "platform/cache", Owner: "test"}}}, Roots{}, nil)
	if err == nil || !strings.Contains(err.Error(), "JSON pointer") {
		t.Fatalf("error = %v, want JSON pointer validation", err)
	}
}

func TestAssembleAppendUniqueAndRejectsSymlinkEscape(t *testing.T) {
	result, err := Assemble(ConfigAssembly{Patches: []ConfigPatch{{ID: "tags", Scope: ScopePlatform, Operation: OperationAppendUnique, Path: "/tags", Value: []byte(`["b","c"]`), Owner: "test"}}}, Roots{}, []byte(`{"tags":["a","b"]}`))
	if err != nil {
		t.Fatal(err)
	}
	if string(result.Config) != "{\n  \"tags\": [\n    \"a\",\n    \"b\",\n    \"c\"\n  ]\n}\n" {
		t.Fatalf("config = %s", result.Config)
	}

	root := t.TempDir()
	outside := t.TempDir()
	link := filepath.Join(root, "linked")
	if err := os.Symlink(outside, link); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	_, err = Assemble(ConfigAssembly{Artifacts: []ArtifactWrite{{ID: "escape", Root: RootProject, Path: "linked/file.txt", Format: FormatText, Text: "x", Owner: "test", Overwrite: OverwriteReplace}}}, Roots{RootProject: root}, nil)
	if !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("symlink error = %v, want ErrInvalidPath", err)
	}
}

func TestAssembleKeepsProjectAndPlatformScopesSeparate(t *testing.T) {
	platform, project := t.TempDir(), t.TempDir()
	result, err := Assemble(ConfigAssembly{
		Patches: []ConfigPatch{
			{ID: "platform.dir", Scope: ScopePlatform, Operation: OperationSet, Path: "/platform/dir", Value: []byte(`"platform"`), Owner: "runtime"},
			{ID: "project.name", Scope: ScopeProject, Operation: OperationSet, Path: "/project/name", Value: []byte(`"project"`), Owner: "runtime"},
		},
		Outputs: []ConfigOutput{
			{Scope: ScopePlatform, Path: ".kb/kb.config.jsonc", Format: FormatJSONC},
			{Scope: ScopeProject, Path: ".kb/project.jsonc", Format: FormatJSONC},
		},
	}, Roots{RootPlatform: platform, RootProject: project}, []byte(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Artifacts) != 2 {
		t.Fatalf("artifacts = %#v", result.Artifacts)
	}
	for _, artifact := range result.Artifacts {
		if strings.Contains(artifact.Path, "kb.config") && !strings.Contains(string(artifact.Content), `"platform"`) {
			t.Fatalf("platform artifact = %s", artifact.Content)
		}
		if strings.Contains(artifact.Path, "project.jsonc") && !strings.Contains(string(artifact.Content), `"project"`) {
			t.Fatalf("project artifact = %s", artifact.Content)
		}
	}
}

func TestAssembleRejectsSecretConfigPatch(t *testing.T) {
	_, err := Assemble(ConfigAssembly{Patches: []ConfigPatch{{ID: "secret", Scope: ScopeSecretEnv, Operation: OperationSet, Path: "/TOKEN", Value: []byte(`"hidden"`), Owner: "test"}}}, Roots{}, nil)
	if err == nil || !strings.Contains(err.Error(), "secret-env") {
		t.Fatalf("secret error = %v", err)
	}
}
