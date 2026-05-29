package cmd

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kb-labs/kb-deploy/internal/config"
	"github.com/kb-labs/kb-deploy/internal/secrets"
)

type mapBackend map[string]string

func (m mapBackend) Lookup(n string) (string, bool) { v, ok := m[n]; return v, ok }

func writeConfigFile(t *testing.T, dir, body string) string {
	t.Helper()
	p := filepath.Join(dir, "kb.config.jsonc")
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func baseCfg() *config.Config {
	return &config.Config{
		Schema:   config.CurrentSchema,
		Platform: &config.PlatformConfig{Version: "2.94.0", Config: "kb.config.jsonc"},
		Services: map[string]config.Service{
			"gateway": {
				Service: "@kb-labs/gateway-app",
				Version: "2.94.0",
				Targets: config.ServiceTargets{Hosts: []string{"prod-1"}},
			},
		},
		Hosts: map[string]config.Host{
			"prod-1": {
				SSH: config.SSHConfig{Host: "1.2.3.4", User: "kb"},
				Env: map[string]string{
					"MONGODB_URI": "${secrets.MONGODB_URI}",
					"REDIS_URL":   "redis://localhost:6379",
				},
			},
		},
	}
}

func TestPrepareConfigs_HappyPath(t *testing.T) {
	dir := t.TempDir()
	writeConfigFile(t, dir, `{
  // adapter bindings
  "adapters": { "doc-db": "mongodb", },
}`)
	r := &secrets.Resolver{
		Secrets: mapBackend{"MONGODB_URI": "mongodb://prod/db"},
		Env:     mapBackend{},
	}

	got, err := prepareConfigs(baseCfg(), r, dir)
	if err != nil {
		t.Fatalf("prepareConfigs: %v", err)
	}
	dc, ok := got["prod-1"]
	if !ok {
		t.Fatal("prod-1 missing")
	}
	if !strings.Contains(dc.JSONC, "doc-db") {
		t.Errorf("jsonc not carried: %q", dc.JSONC)
	}
	// .env body is sorted, resolved, KEY=VALUE per line.
	wantEnv := "MONGODB_URI=mongodb://prod/db\nREDIS_URL=redis://localhost:6379\n"
	if dc.Env != wantEnv {
		t.Errorf("env body = %q, want %q", dc.Env, wantEnv)
	}
	if dc.Hash == "" {
		t.Error("hash must be set")
	}
}

func TestPrepareConfigs_MissingFile(t *testing.T) {
	dir := t.TempDir() // no config file written
	r := &secrets.Resolver{Secrets: mapBackend{}, Env: mapBackend{}}
	_, err := prepareConfigs(baseCfg(), r, dir)
	if err == nil || !strings.Contains(err.Error(), "config") {
		t.Fatalf("expected missing-config error, got %v", err)
	}
}

func TestPrepareConfigs_InvalidJSONC(t *testing.T) {
	dir := t.TempDir()
	writeConfigFile(t, dir, `{ "adapters": { broken`)
	r := &secrets.Resolver{Secrets: mapBackend{"MONGODB_URI": "x"}, Env: mapBackend{}}
	_, err := prepareConfigs(baseCfg(), r, dir)
	if err == nil || !strings.Contains(err.Error(), "JSONC") {
		t.Fatalf("expected JSONC error, got %v", err)
	}
}

func TestPrepareConfigs_UnresolvedSecret(t *testing.T) {
	dir := t.TempDir()
	writeConfigFile(t, dir, `{}`)
	r := &secrets.Resolver{Secrets: mapBackend{}, Env: mapBackend{}} // MONGODB_URI absent
	_, err := prepareConfigs(baseCfg(), r, dir)
	if err == nil {
		t.Fatal("expected unresolved-secret error")
	}
}

func TestPrepareConfigs_EmptySecretIsError(t *testing.T) {
	dir := t.TempDir()
	writeConfigFile(t, dir, `{}`)
	r := &secrets.Resolver{Secrets: mapBackend{"MONGODB_URI": ""}, Env: mapBackend{}} // present but empty
	_, err := prepareConfigs(baseCfg(), r, dir)
	if err == nil || !strings.Contains(err.Error(), "empty") {
		t.Fatalf("expected empty-secret error, got %v", err)
	}
}

func TestPrepareConfigs_SecretRotationChangesHash(t *testing.T) {
	dir := t.TempDir()
	writeConfigFile(t, dir, `{}`)
	r1 := &secrets.Resolver{Secrets: mapBackend{"MONGODB_URI": "uri-v1"}, Env: mapBackend{}}
	r2 := &secrets.Resolver{Secrets: mapBackend{"MONGODB_URI": "uri-v2"}, Env: mapBackend{}}

	g1, err := prepareConfigs(baseCfg(), r1, dir)
	if err != nil {
		t.Fatal(err)
	}
	g2, err := prepareConfigs(baseCfg(), r2, dir)
	if err != nil {
		t.Fatal(err)
	}
	if g1["prod-1"].Hash == g2["prod-1"].Hash {
		t.Error("secret rotation must change config hash")
	}
}

func TestPrepareConfigs_UndefinedHostIsError(t *testing.T) {
	dir := t.TempDir()
	writeConfigFile(t, dir, `{}`)
	c := baseCfg()
	// Service targets a host that is absent from hosts: — must fail fast rather
	// than silently delivering an empty env to a zero-value host.
	svc := c.Services["gateway"]
	svc.Targets.Hosts = []string{"ghost-1"}
	c.Services["gateway"] = svc
	r := &secrets.Resolver{Secrets: mapBackend{}, Env: mapBackend{}}
	_, err := prepareConfigs(c, r, dir)
	if err == nil || !strings.Contains(err.Error(), "ghost-1") {
		t.Fatalf("expected undefined-host error naming ghost-1, got %v", err)
	}
}

func TestPrepareConfigs_NoPlatformConfigIsNoOp(t *testing.T) {
	dir := t.TempDir()
	c := baseCfg()
	c.Platform.Config = ""
	r := &secrets.Resolver{Secrets: mapBackend{}, Env: mapBackend{}}
	got, err := prepareConfigs(c, r, dir)
	if err != nil {
		t.Fatalf("no config declared should be a no-op, got %v", err)
	}
	if got != nil {
		t.Errorf("expected nil map, got %v", got)
	}
}
