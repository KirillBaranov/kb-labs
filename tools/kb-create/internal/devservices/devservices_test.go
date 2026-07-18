package devservices

import (
	"os"
	"path/filepath"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestPruneUnknownDeps(t *testing.T) {
	f := &File{Services: map[string]Service{
		"gateway":  {Command: "node g", DependsOn: []string{"rest", "workflow"}},
		"rest":     {Command: "node r", DependsOn: []string{"qdrant"}}, // external → dropped
		"workflow": {Command: "node w"},
	}}
	dropped := f.PruneUnknownDeps()

	// rest→qdrant is the only unknown; gateway's deps are all present.
	if len(dropped) != 1 || dropped[0] != "rest→qdrant" {
		t.Errorf("dropped = %v, want [rest→qdrant]", dropped)
	}
	if got := f.Services["rest"].DependsOn; len(got) != 0 {
		t.Errorf("rest deps = %v, want empty (qdrant pruned)", got)
	}
	if got := f.Services["gateway"].DependsOn; len(got) != 2 {
		t.Errorf("gateway deps = %v, want [rest workflow] kept", got)
	}
}

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

// ── Bug B (Studio auth / resource-config investigation): write validation ────
//
// devservices.go currently performs NO schema validation at write time — a
// service with an empty Command or a port colliding with another service's
// port is written to disk as-is, deferring the failure to whenever kb-dev
// next tries to start it (see tools/kb-dev/internal/config, which DOES
// validate on read — TestLoadDetectsDuplicatePort etc. there). These two
// tests assert the write-time contract we want; they are expected to FAIL
// against current code (Save has no validation) until that gap is closed.

// TestSave_RejectsEmptyCommand documents that a service written without a
// Command should be rejected at Save() time — an empty command silently
// written to devservices.yaml only breaks the next `kb-dev start`.
func TestSave_RejectsEmptyCommand(t *testing.T) {
	dir := t.TempDir()
	f, _ := Load(dir)
	f.Upsert("broken", Service{Command: "", Port: 9000})

	err := f.Save(dir)
	if err == nil {
		t.Error("Save() with an empty Command succeeded — want an error before it ever reaches kb-dev")
	}
}

// TestSave_RejectsDuplicatePort documents that two services sharing the same
// port (e.g. two plugin manifests both defaulting to an unconfigured port)
// should be rejected at Save() time, not discovered later when kb-dev fails
// to bind the second service.
func TestSave_RejectsDuplicatePort(t *testing.T) {
	dir := t.TempDir()
	f, _ := Load(dir)
	f.Upsert("svc-a", Service{Command: "node a.js", Port: 5050})
	f.Upsert("svc-b", Service{Command: "node b.js", Port: 5050})

	err := f.Save(dir)
	if err == nil {
		t.Error("Save() with two services on the same port succeeded — want an error before kb-dev start fails on it")
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

	id, svc := EntryForSwap("/opt/kb-platform", "@kb-labs/gateway-test", "gateway-test", manifest, nil)
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

// TestEntryForSwap_PropagatesSocket guards socket-based transport: a service
// that declares runtime.socket in its manifest must carry that socket path
// (placeholder intact) into the generated devservices entry, so kb-dev binds
// the unix socket instead of a TCP port.
func TestEntryForSwap_PropagatesSocket(t *testing.T) {
	m := &ServiceManifest{
		Schema:  "kb.service/1",
		ID:      "marketplace",
		Name:    "Marketplace",
		Version: "1.0.0",
	}
	m.Runtime.Entry = "dist/index.js"
	m.Runtime.Port = 5070
	m.Runtime.HealthCheck = "/health"
	m.Runtime.Socket = "/tmp/kb-${KB_SOCKET_HASH}/marketplace.sock"

	_, svc := EntryForSwap("/opt/kb-platform", "@kb-labs/marketplace", "marketplace", m, nil)

	// Placeholder must pass through verbatim — expansion happens in kb-dev, not here.
	if svc.Socket != "/tmp/kb-${KB_SOCKET_HASH}/marketplace.sock" {
		t.Errorf("socket = %q, want literal ${KB_SOCKET_HASH} placeholder preserved", svc.Socket)
	}
}

// TestEntryForSwap_MissingHealthCheckStillProbesPort documents the desired
// fix for the "silent false-positive health check" gap found during the
// Studio-auth/resource-config investigation: a manifest that declares a port
// but no runtime.healthCheck currently produces Service.HealthCheck == "".
// Downstream, tools/kb-dev/internal/health.ClassifyProbe("") classifies that
// as a ProbeCommand with an empty target, and `bash -c ""` exits 0 — the
// service is reported healthy even if it never bound to anything. The
// correct behavior is to fall back to a TCP probe on the known port rather
// than leaving HealthCheck empty. Expected to FAIL against current code.
func TestEntryForSwap_MissingHealthCheckStillProbesPort(t *testing.T) {
	m := &ServiceManifest{Schema: "kb.service/1", ID: "no-health-check"}
	m.Runtime.Entry = "dist/index.js"
	m.Runtime.Port = 4321
	m.Runtime.HealthCheck = "" // manifest omits healthCheck entirely

	_, svc := EntryForSwap("/p", "@kb-labs/no-health-check", "no-health-check", m, nil)

	if svc.HealthCheck == "" {
		t.Errorf("HealthCheck is empty with Port=%d set — this becomes a false-positive "+
			"\"healthy\" command probe (bash -c \"\" exits 0) in tools/kb-dev/internal/health.ClassifyProbe; "+
			"want a fallback TCP probe like \"localhost:%d\"", svc.Port, svc.Port)
	}
}

func TestEntryForSwap_NoSocketWhenAbsent(t *testing.T) {
	m := &ServiceManifest{Schema: "kb.service/1", ID: "gateway"}
	m.Runtime.Entry = "dist/index.js"
	m.Runtime.Port = 4000
	m.Runtime.HealthCheck = "/health"

	_, svc := EntryForSwap("/p", "@kb-labs/gateway", "gateway", m, nil)
	if svc.Socket != "" {
		t.Errorf("socket = %q, want empty for TCP-only service", svc.Socket)
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
	_, svc := EntryForSwap("/p", "@x/y", "y", m, nil)
	if svc.Env["PORT"] != "4000" || svc.Env["LOG"] != "info" {
		t.Errorf("defaults lost: %v", svc.Env)
	}
	if _, ok := svc.Env["REQUIRED"]; ok {
		t.Errorf("REQUIRED without default leaked into devservices env: %v", svc.Env)
	}
}

// TestEntryForSwap_EnvOverridesRetargetPort is the Studio regression: a deploy
// env override of PORT must win over the manifest default AND retarget the
// health-check + url so kb-dev probes the right port (manifest 3000 → 3002).
func TestEntryForSwap_EnvOverridesRetargetPort(t *testing.T) {
	m := &ServiceManifest{
		Schema: "kb.service/1",
		ID:     "studio",
		Env:    map[string]ServiceEnvVar{"PORT": {Default: "3000"}},
	}
	m.Runtime.Entry = "server.js"
	m.Runtime.Port = 3000
	m.Runtime.HealthCheck = "/"

	_, svc := EntryForSwap("/p", "@kb-labs/studio-app", "studio-app", m, map[string]string{
		"PORT":            "3002",
		"KB_API_BASE_URL": "https://x/api/v1",
	})
	if svc.Env["PORT"] != "3002" {
		t.Errorf("PORT override lost: %v", svc.Env)
	}
	if svc.Env["KB_API_BASE_URL"] != "https://x/api/v1" {
		t.Errorf("extra override lost: %v", svc.Env)
	}
	if svc.Port != 3002 {
		t.Errorf("port not retargeted: %d", svc.Port)
	}
	if svc.HealthCheck != "http://localhost:3002/" {
		t.Errorf("health not retargeted: %q", svc.HealthCheck)
	}
	if svc.URL != "http://localhost:3002" {
		t.Errorf("url not retargeted: %q", svc.URL)
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
