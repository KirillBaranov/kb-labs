package devservices

import (
	"os"
	"path/filepath"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestLoad_AbsentReturnsEmpty(t *testing.T) {
	f, err := Load(t.TempDir())
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if f == nil || f.Services == nil {
		t.Fatalf("expected non-nil empty file, got %+v", f)
	}
}

func TestUpsertAndRoundtrip(t *testing.T) {
	dir := t.TempDir()
	f, _ := Load(dir)
	f.Name = "KB Labs Platform"
	f.Upsert("gateway", Service{
		Name:        "Gateway",
		Command:     "node /opt/kb-platform/services/gateway/current/node_modules/@kb-labs/gateway/dist/index.js",
		HealthCheck: "http://localhost:4000/health",
		Port:        4000,
		URL:         "http://localhost:4000",
		Env:         map[string]string{"PORT": "4000"},
		DependsOn:   []string{"rest"},
	})
	if err := f.Save(dir); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := Load(dir)
	if err != nil {
		t.Fatalf("re-Load: %v", err)
	}
	svc, ok := got.Services["gateway"]
	if !ok {
		t.Fatal("entry lost after roundtrip")
	}
	if svc.Port != 4000 || svc.HealthCheck != "http://localhost:4000/health" ||
		svc.Command == "" || svc.DependsOn[0] != "rest" {
		t.Errorf("entry corrupted: %+v", svc)
	}
}

func TestUpsert_PreservesOtherEntries(t *testing.T) {
	dir := t.TempDir()
	// Seed file with two entries by writing yaml directly.
	seed := `name: seeded
services:
  alpha:
    command: /bin/true
    port: 1001
  beta:
    command: /bin/true
    port: 1002
`
	_ = os.MkdirAll(filepath.Join(dir, ".kb"), 0o755)
	_ = os.WriteFile(filepath.Join(dir, ".kb", Filename), []byte(seed), 0o644)

	f, err := Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	f.Upsert("alpha", Service{Command: "/bin/new", Port: 1111})
	if err := f.Save(dir); err != nil {
		t.Fatal(err)
	}
	got, _ := Load(dir)
	if got.Services["alpha"].Port != 1111 {
		t.Errorf("alpha not updated: %+v", got.Services["alpha"])
	}
	if got.Services["beta"].Port != 1002 {
		t.Errorf("beta clobbered: %+v", got.Services["beta"])
	}
}

func TestSave_EmitsValidYAML(t *testing.T) {
	dir := t.TempDir()
	f, _ := Load(dir)
	f.Upsert("x", Service{Command: "/bin/true", Port: 9})
	if err := f.Save(dir); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(filepath.Join(dir, ".kb", Filename))
	var reparsed map[string]interface{}
	if err := yaml.Unmarshal(data, &reparsed); err != nil {
		t.Fatalf("emitted yaml fails to parse: %v\n%s", err, data)
	}
}

func TestEntryForSwap_BuildsCommandAndHealth(t *testing.T) {
	manifest := &ServiceManifest{
		Schema:  "kb.service/1",
		ID:      "gateway-test",
		Name:    "Gateway Test",
		Version: "1.0.0",
	}
	manifest.Runtime.Entry = "dist/index.js"
	manifest.Runtime.Port = 4000
	manifest.Runtime.HealthCheck = "/health"

	id, svc := EntryForSwap("/opt/kb-platform", "@kb-labs/gateway-test", "gateway-test", manifest)
	if id != "gateway-test" {
		t.Errorf("id = %q", id)
	}
	wantCmd := "node /opt/kb-platform/services/gateway-test/current/node_modules/@kb-labs/gateway-test/dist/index.js"
	if svc.Command != wantCmd {
		t.Errorf("command = %q\nwant     %q", svc.Command, wantCmd)
	}
	if svc.HealthCheck != "http://localhost:4000/health" {
		t.Errorf("health = %q", svc.HealthCheck)
	}
	if svc.Port != 4000 {
		t.Errorf("port = %d", svc.Port)
	}
	if svc.URL != "http://localhost:4000" {
		t.Errorf("url = %q", svc.URL)
	}
}

func TestEntryForSwap_EnvDefaultsOnly(t *testing.T) {
	m := &ServiceManifest{
		Schema: "kb.service/1",
		ID:     "svc",
		Env: map[string]ServiceEnvVar{
			"PORT":     {Default: "4000"},
			"LOG":      {Default: "info"},
			"REQUIRED": {Required: true}, // no default → must be absent from devservices
		},
	}
	m.Runtime.Entry = "e.js"
	_, svc := EntryForSwap("/p", "@x/y", "y", m)
	if svc.Env["PORT"] != "4000" || svc.Env["LOG"] != "info" {
		t.Errorf("defaults lost: %v", svc.Env)
	}
	if _, ok := svc.Env["REQUIRED"]; ok {
		t.Errorf("REQUIRED without default leaked into devservices env: %v", svc.Env)
	}
}

func TestLoadManifest_RejectsWrongSchema(t *testing.T) {
	p := filepath.Join(t.TempDir(), "manifest.json")
	_ = os.WriteFile(p, []byte(`{"schema":"kb.service/9","id":"x","runtime":{"entry":"i.js"}}`), 0o644)
	if _, err := LoadManifest(p); err == nil {
		t.Error("expected unsupported schema error")
	}
}

func TestLoadManifest_RejectsMissingFields(t *testing.T) {
	p := filepath.Join(t.TempDir(), "manifest.json")
	_ = os.WriteFile(p, []byte(`{"schema":"kb.service/1","runtime":{"entry":"i.js"}}`), 0o644)
	if _, err := LoadManifest(p); err == nil {
		t.Error("expected empty-id error")
	}
}
