package config

import (
	"os"
	"path/filepath"
	"testing"
)

// ── expandString ─────────────────────────────────────────────────────────────

func TestExpandStringNoPlaceholder(t *testing.T) {
	got, err := expandString("hello world", "ctx", alwaysEmpty)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "hello world" {
		t.Errorf("got %q, want %q", got, "hello world")
	}
}

func TestExpandStringSubstitutes(t *testing.T) {
	lookup := mapLookup(map[string]string{"PORT": "3000", "HOST": "localhost"})
	got, err := expandString("http://${HOST}:${PORT}/health", "ctx", lookup)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := "http://localhost:3000/health"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestExpandStringMissingVarErrors(t *testing.T) {
	_, err := expandString("${MISSING}", "service \"api\".command", alwaysEmpty)
	if err == nil {
		t.Fatal("expected error for missing variable, got nil")
	}
}

func TestExpandStringUnclosedBraceTreatedAsLiteral(t *testing.T) {
	got, err := expandString("${UNCLOSED", "ctx", alwaysEmpty)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "${UNCLOSED" {
		t.Errorf("got %q, want literal ${UNCLOSED", got)
	}
}

func TestExpandStringEmptyVarValue(t *testing.T) {
	lookup := mapLookup(map[string]string{"EMPTY": ""})
	got, err := expandString("prefix_${EMPTY}_suffix", "ctx", lookup)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "prefix__suffix" {
		t.Errorf("got %q, want %q", got, "prefix__suffix")
	}
}

func TestExpandStringMultipleVars(t *testing.T) {
	lookup := mapLookup(map[string]string{"A": "foo", "B": "bar", "C": "baz"})
	got, err := expandString("${A}-${B}-${C}", "ctx", lookup)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "foo-bar-baz" {
		t.Errorf("got %q, want %q", got, "foo-bar-baz")
	}
}

// ── loadDotEnv ───────────────────────────────────────────────────────────────

func TestLoadDotEnvMissingFile(t *testing.T) {
	m, err := loadDotEnv("/nonexistent/path/.env")
	if err != nil {
		t.Fatalf("expected no error for missing file, got %v", err)
	}
	if len(m) != 0 {
		t.Errorf("expected empty map, got %v", m)
	}
}

func TestLoadDotEnvBasic(t *testing.T) {
	path := writeDotEnv(t, `
KEY=value
PORT=3000
# comment line

EMPTY=
`)
	m, err := loadDotEnv(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	cases := map[string]string{"KEY": "value", "PORT": "3000", "EMPTY": ""}
	for k, want := range cases {
		if got := m[k]; got != want {
			t.Errorf("m[%q] = %q, want %q", k, got, want)
		}
	}
}

func TestLoadDotEnvStripsQuotes(t *testing.T) {
	path := writeDotEnv(t, `
DOUBLE="hello world"
SINGLE='foo bar'
NOQUOTE=plain
`)
	m, err := loadDotEnv(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	cases := map[string]string{
		"DOUBLE":  "hello world",
		"SINGLE":  "foo bar",
		"NOQUOTE": "plain",
	}
	for k, want := range cases {
		if got := m[k]; got != want {
			t.Errorf("m[%q] = %q, want %q", k, got, want)
		}
	}
}

func TestLoadDotEnvInvalidLineErrors(t *testing.T) {
	path := writeDotEnv(t, "NOEQUALS\n")
	_, err := loadDotEnv(path)
	if err == nil {
		t.Fatal("expected error for invalid line, got nil")
	}
}

func TestLoadDotEnvValueWithEquals(t *testing.T) {
	// Values that contain '=' must be preserved correctly.
	path := writeDotEnv(t, "DATABASE_URL=postgres://user:pass@host/db?sslmode=disable\n")
	m, err := loadDotEnv(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := "postgres://user:pass@host/db?sslmode=disable"
	if got := m["DATABASE_URL"]; got != want {
		t.Errorf("m[DATABASE_URL] = %q, want %q", got, want)
	}
}

// ── expandEnv integration ────────────────────────────────────────────────────

func TestExpandEnvFromProcessEnv(t *testing.T) {
	t.Setenv("TEST_PORT", "4000")

	yf := minimalYAMLWithVar("${TEST_PORT}")
	if err := expandEnv(yf, t.TempDir()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertPort(t, yf, "4000")
}

func TestExpandEnvFromDotEnvFile(t *testing.T) {
	dir := t.TempDir()
	writeDotEnvTo(t, filepath.Join(dir, ".env"), "TEST_SECRET=mysecret\n")

	yf := minimalYAMLWithEnvVar("${TEST_SECRET}")
	if err := expandEnv(yf, dir); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := yf.Services["api"].Env["SECRET"]; got != "mysecret" {
		t.Errorf("got %q, want %q", got, "mysecret")
	}
}

func TestExpandEnvProcessEnvWinsDotEnv(t *testing.T) {
	// Process env must take priority over .env file.
	t.Setenv("PRIORITY_VAR", "from-process")

	dir := t.TempDir()
	writeDotEnvTo(t, filepath.Join(dir, ".env"), "PRIORITY_VAR=from-dotenv\n")

	yf := minimalYAMLWithEnvVar("${PRIORITY_VAR}")
	if err := expandEnv(yf, dir); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := yf.Services["api"].Env["SECRET"]; got != "from-process" {
		t.Errorf("got %q, want %q", got, "from-process")
	}
}

func TestExpandEnvMissingVarErrors(t *testing.T) {
	yf := minimalYAMLWithVar("${DEFINITELY_UNSET_XYZ123}")
	err := expandEnv(yf, t.TempDir())
	if err == nil {
		t.Fatal("expected error for missing variable, got nil")
	}
}

func TestExpandEnvNoPlaceholders(t *testing.T) {
	// Config without any ${} references must pass through unchanged.
	yf := &yamlFile{
		Name: "test",
		Services: map[string]yamlService{
			"api": {Command: "pnpm dev", Port: 3000},
		},
	}
	if err := expandEnv(yf, t.TempDir()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := yf.Services["api"].Command; got != "pnpm dev" {
		t.Errorf("command mutated: got %q", got)
	}
}

func TestExpandEnvAllStringFields(t *testing.T) {
	// All string fields that support expansion must be substituted.
	t.Setenv("STOP_CMD", "docker stop pg")
	t.Setenv("HC_URL", "http://localhost:5432")
	t.Setenv("SVC_URL", "http://localhost:5432")
	t.Setenv("CTR", "my-postgres")
	t.Setenv("NOTE_VAL", "needs login")

	yf := &yamlFile{
		Name: "test",
		Services: map[string]yamlService{
			"pg": {
				Command:     "docker run postgres",
				StopCommand: "${STOP_CMD}",
				HealthCheck: "${HC_URL}",
				URL:         "${SVC_URL}",
				Container:   "${CTR}",
				Note:        "${NOTE_VAL}",
				Port:        5432,
			},
		},
	}
	if err := expandEnv(yf, t.TempDir()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	svc := yf.Services["pg"]
	if svc.StopCommand != "docker stop pg" {
		t.Errorf("stop_command: got %q", svc.StopCommand)
	}
	if svc.HealthCheck != "http://localhost:5432" {
		t.Errorf("health_check: got %q", svc.HealthCheck)
	}
	if svc.URL != "http://localhost:5432" {
		t.Errorf("url: got %q", svc.URL)
	}
	if svc.Container != "my-postgres" {
		t.Errorf("container: got %q", svc.Container)
	}
	if svc.Note != "needs login" {
		t.Errorf("note: got %q", svc.Note)
	}
}

// ── loadYAML integration ─────────────────────────────────────────────────────

func TestLoadYAMLExpandsEnvVars(t *testing.T) {
	t.Setenv("API_PORT_TEST", "9090")

	dir := t.TempDir()
	writeDotEnvTo(t, filepath.Join(dir, ".env"), "DB_PASS_TEST=secret\n")

	cfg := writeAndLoadYAML(t, dir, `
name: test
services:
  api:
    command: pnpm dev
    port: 9090
    health_check: http://localhost:${API_PORT_TEST}/health
    env:
      DB_PASSWORD: ${DB_PASS_TEST}
`)

	svc := cfg.Services["api"]
	if svc.HealthCheck != "http://localhost:9090/health" {
		t.Errorf("health_check: got %q", svc.HealthCheck)
	}
	if svc.Env["DB_PASSWORD"] != "secret" {
		t.Errorf("env.DB_PASSWORD: got %q", svc.Env["DB_PASSWORD"])
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

func alwaysEmpty(_ string) (string, bool) { return "", false }

func mapLookup(m map[string]string) func(string) (string, bool) {
	return func(key string) (string, bool) {
		v, ok := m[key]
		return v, ok
	}
}

func writeDotEnv(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), ".env")
	writeDotEnvTo(t, path, content)
	return path
}

func writeDotEnvTo(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

// minimalYAMLWithVar returns a yamlFile where the api service's health_check
// contains the given placeholder (used to test command/url expansion).
func minimalYAMLWithVar(placeholder string) *yamlFile {
	return &yamlFile{
		Name: "test",
		Services: map[string]yamlService{
			"api": {
				Command:     "pnpm dev",
				Port:        3000,
				HealthCheck: placeholder,
			},
		},
	}
}

// minimalYAMLWithEnvVar returns a yamlFile with an env key referencing the placeholder.
func minimalYAMLWithEnvVar(placeholder string) *yamlFile {
	return &yamlFile{
		Name: "test",
		Services: map[string]yamlService{
			"api": {
				Command: "pnpm dev",
				Port:    3000,
				Env:     map[string]string{"SECRET": placeholder},
			},
		},
	}
}

func assertPort(t *testing.T, yf *yamlFile, want string) {
	t.Helper()
	got := yf.Services["api"].HealthCheck
	if got != want {
		t.Errorf("health_check: got %q, want %q", got, want)
	}
}

// writeAndLoadYAML writes content to <dir>/devservices.yaml and loads it.
func writeAndLoadYAML(t *testing.T, dir, content string) *Config {
	t.Helper()
	path := filepath.Join(dir, "devservices.yaml")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	return cfg
}
