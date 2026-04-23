package lock

import (
	"path/filepath"
	"testing"
	"time"
)

func TestLoad_AbsentFileReturnsNilNoError(t *testing.T) {
	dir := t.TempDir()
	l, err := Load(filepath.Join(dir, "deploy.yaml"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if l != nil {
		t.Errorf("expected nil for missing lock, got %+v", l)
	}
}

func TestSaveLoad_Roundtrip(t *testing.T) {
	dir := t.TempDir()
	deploy := filepath.Join(dir, "deploy.yaml")

	l := New("kb-deploy@test")
	l.Platform.Version = "1.5.0"
	l.Services["gateway"] = ServiceLock{
		Resolved:  "@kb-labs/gateway@1.2.3",
		Integrity: "sha256-abc",
		Adapters: map[string]ResolvedDep{
			"llm": {Resolved: "@kb-labs/adapters-openai@0.4.1"},
		},
		ConfigHash: "sha256-def",
		AppliedTo: map[string]HostApplication{
			"prod-1": {ReleaseID: "gateway-1.2.3-aaa", AppliedAt: time.Now().UTC().Truncate(time.Second)},
		},
	}
	if err := l.Save(deploy); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := Load(deploy)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got.Platform.Version != "1.5.0" {
		t.Errorf("version lost: %v", got.Platform.Version)
	}
	svc, ok := got.Services["gateway"]
	if !ok {
		t.Fatal("gateway service lost")
	}
	if svc.Resolved != "@kb-labs/gateway@1.2.3" {
		t.Errorf("resolved = %q", svc.Resolved)
	}
	if svc.Adapters["llm"].Resolved != "@kb-labs/adapters-openai@0.4.1" {
		t.Errorf("adapter lost: %v", svc.Adapters)
	}
	if svc.AppliedTo["prod-1"].ReleaseID != "gateway-1.2.3-aaa" {
		t.Errorf("applied-to lost: %v", svc.AppliedTo)
	}
}

func TestLoad_BadSchemaErrors(t *testing.T) {
	dir := t.TempDir()
	deploy := filepath.Join(dir, "deploy.yaml")
	l := New("test")
	l.Schema = "kb.deploy.lock/999"
	if err := l.Save(deploy); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if _, err := Load(deploy); err == nil {
		t.Error("expected error for bad schema")
	}
}

func TestNew_SetsDefaults(t *testing.T) {
	l := New("x")
	if l.Schema != SchemaVersion {
		t.Errorf("schema not set")
	}
	if l.GeneratedAt == "" {
		t.Errorf("GeneratedAt not set")
	}
	if l.Services == nil {
		t.Errorf("Services map must be non-nil")
	}
}
