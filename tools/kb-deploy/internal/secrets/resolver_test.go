package secrets

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type mapBackend map[string]string

func (m mapBackend) Lookup(name string) (string, bool) {
	v, ok := m[name]
	return v, ok
}

func TestExpand_SecretsAndEnv(t *testing.T) {
	r := &Resolver{
		Secrets: mapBackend{"OPENAI_KEY": "sk-secret"},
		Env:     mapBackend{"DEPLOY_REGION": "eu-west-1"},
	}
	out, err := r.Expand("region=${env.DEPLOY_REGION} key=${secrets.OPENAI_KEY}")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if out != "region=eu-west-1 key=sk-secret" {
		t.Errorf("got %q", out)
	}
}

func TestExpand_CollectsAllMissing(t *testing.T) {
	r := &Resolver{Secrets: mapBackend{}, Env: mapBackend{}}
	_, err := r.Expand("a=${secrets.A} b=${env.B}")
	if err == nil {
		t.Fatal("expected error")
	}
	msg := err.Error()
	if !strings.Contains(msg, "${secrets.A}") || !strings.Contains(msg, "${env.B}") {
		t.Errorf("both missing refs should be reported, got %q", msg)
	}
}

func TestExpand_NoRefs(t *testing.T) {
	r := &Resolver{Secrets: mapBackend{}, Env: mapBackend{}}
	out, err := r.Expand("plain string")
	if err != nil {
		t.Errorf("unexpected: %v", err)
	}
	if out != "plain string" {
		t.Errorf("got %q", out)
	}
}

func TestExpand_IgnoresNonMatchingDollar(t *testing.T) {
	r := &Resolver{Secrets: mapBackend{"A": "x"}}
	out, err := r.Expand("price is $5 and ${secrets.A}")
	if err != nil {
		t.Errorf("unexpected: %v", err)
	}
	if !strings.Contains(out, "$5") || !strings.Contains(out, "x") {
		t.Errorf("unexpected output: %q", out)
	}
}

func TestExpandMap(t *testing.T) {
	r := &Resolver{Secrets: mapBackend{"K": "v"}}
	out, err := r.ExpandMap(map[string]string{
		"a": "plain",
		"b": "${secrets.K}",
	})
	if err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	if out["a"] != "plain" || out["b"] != "v" {
		t.Errorf("got %v", out)
	}
}

func TestReferences(t *testing.T) {
	secrets, envs := References("${secrets.A} something ${env.B} ${secrets.A}")
	if len(secrets) != 1 || secrets[0] != "A" {
		t.Errorf("secrets = %v", secrets)
	}
	if len(envs) != 1 || envs[0] != "B" {
		t.Errorf("envs = %v", envs)
	}
}

func TestSecretValue_StringRedacts(t *testing.T) {
	s := NewSecret("sk-abc123")
	if s.String() != "***" {
		t.Errorf("String() leaked: %q", s.String())
	}
	if s.Raw() != "sk-abc123" {
		t.Errorf("Raw() wrong: %q", s.Raw())
	}
}

func TestEnvBackend_ProcessBeatsOverlay(t *testing.T) {
	t.Setenv("TEST_KB_X", "from-env")
	b := &EnvBackend{Overlay: map[string]string{"TEST_KB_X": "from-overlay"}}
	got, ok := b.Lookup("TEST_KB_X")
	if !ok || got != "from-env" {
		t.Errorf("got (%q,%v), want from-env/true", got, ok)
	}
}

func TestEnvBackend_OverlayWhenEnvAbsent(t *testing.T) {
	b := &EnvBackend{Overlay: map[string]string{"ONLY_OVERLAY": "v"}}
	got, ok := b.Lookup("ONLY_OVERLAY")
	if !ok || got != "v" {
		t.Errorf("got (%q,%v)", got, ok)
	}
}

func TestLoadDotEnv(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, ".env")
	content := `# comment
A=1
B="quoted value"
C='single'
EMPTY=
`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	got := LoadDotEnv(path)
	want := map[string]string{"A": "1", "B": "quoted value", "C": "single", "EMPTY": ""}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s: got %q, want %q", k, got[k], v)
		}
	}
}

func TestLoadDotEnv_Missing(t *testing.T) {
	got := LoadDotEnv("/nonexistent/path/.env")
	if len(got) != 0 {
		t.Errorf("missing file should return empty map")
	}
}
