package cmd_test

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
)

// binaryPath builds the kb-deploy binary into a temp dir and returns its path.
// Cached per test run via t.TempDir so it's built once.
func binaryPath(t *testing.T) string {
	t.Helper()
	bin := filepath.Join(t.TempDir(), "kb-deploy")
	if runtime.GOOS == "windows" {
		bin += ".exe"
	}
	// Build from the module root (one level up from cmd/).
	moduleRoot := filepath.Join("..", )
	out, err := exec.Command("go", "build", "-o", bin, moduleRoot).CombinedOutput()
	if err != nil {
		t.Fatalf("build binary: %v\n%s", err, out)
	}
	return bin
}

// configDir creates a temp repo root with a valid .kb/deploy.yaml.
func configDir(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	kbDir := filepath.Join(root, ".kb")
	if err := os.Mkdir(kbDir, 0o755); err != nil {
		t.Fatal(err)
	}
	yaml := `
registry: ghcr.io/test
targets:
  web:
    watch: ["sites/**"]
    image: web
    dockerfile: sites/web/Dockerfile
    context: sites/web
    ssh:
      host: 1.2.3.4
      user: deploy
      key_env: SSH_KEY
    remote:
      compose_file: ~/app/docker-compose.yml
      service: web
`
	if err := os.WriteFile(filepath.Join(kbDir, "deploy.yaml"), []byte(yaml), 0o644); err != nil {
		t.Fatal(err)
	}
	return root
}

func run(t *testing.T, bin, root string, args ...string) ([]byte, int) {
	t.Helper()
	cmd := exec.Command(bin, args...)
	cmd.Dir = root
	out, err := cmd.Output()
	code := 0
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			code = ee.ExitCode()
		} else {
			t.Fatalf("exec: %v", err)
		}
	}
	return out, code
}

func TestJSONList(t *testing.T) {
	bin := binaryPath(t)
	root := configDir(t)

	out, code := run(t, bin, root, "--json", "list")
	if code != 0 {
		t.Fatalf("exit %d: %s", code, out)
	}

	var resp struct {
		OK      bool `json:"ok"`
		Targets []struct {
			Name  string `json:"name"`
			Image string `json:"image"`
			Host  string `json:"host"`
		} `json:"targets"`
	}
	if err := json.Unmarshal(out, &resp); err != nil {
		t.Fatalf("unmarshal: %v\noutput: %s", err, out)
	}
	if !resp.OK {
		t.Errorf("ok = false")
	}
	if len(resp.Targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(resp.Targets))
	}
	if resp.Targets[0].Name != "web" {
		t.Errorf("name = %q, want web", resp.Targets[0].Name)
	}
	if resp.Targets[0].Host != "1.2.3.4" {
		t.Errorf("host = %q, want 1.2.3.4", resp.Targets[0].Host)
	}
}

func TestJSONStatus(t *testing.T) {
	bin := binaryPath(t)
	root := configDir(t)

	out, code := run(t, bin, root, "--json", "status")
	if code != 0 {
		t.Fatalf("exit %d: %s", code, out)
	}

	var resp struct {
		OK      bool            `json:"ok"`
		Targets map[string]any  `json:"targets"`
	}
	if err := json.Unmarshal(out, &resp); err != nil {
		t.Fatalf("unmarshal: %v\noutput: %s", err, out)
	}
	if !resp.OK {
		t.Errorf("ok = false")
	}
	// No deployments yet — targets should be empty map, not null.
	if resp.Targets == nil {
		t.Errorf("targets should be empty map, got nil")
	}
}

func TestJSONRunMissingEnv(t *testing.T) {
	bin := binaryPath(t)
	root := configDir(t)

	// SSH_KEY not set — should fail with non-zero exit and JSON error.
	out, code := run(t, bin, root, "--json", "run", "--all")
	if code == 0 {
		t.Fatalf("expected non-zero exit when SSH_KEY missing, got 0\noutput: %s", out)
	}

	var resp struct {
		OK   bool   `json:"ok"`
		Hint string `json:"hint"`
	}
	if err := json.Unmarshal(out, &resp); err != nil {
		t.Fatalf("unmarshal error response: %v\noutput: %s", err, out)
	}
	if resp.OK {
		t.Errorf("ok should be false on env validation failure")
	}
}
