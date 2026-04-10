package cmd_test

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
)

// binaryPath builds the kb-monitor binary into a temp dir and returns its path.
func binaryPath(t *testing.T) string {
	t.Helper()
	bin := filepath.Join(t.TempDir(), "kb-monitor")
	if runtime.GOOS == "windows" {
		bin += ".exe"
	}
	moduleRoot := filepath.Join("..")
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

// TestJSONHealthNoSSH verifies that health --json returns ok:true with
// per-target error when SSH key is absent (tool-level success, target-level failure).
func TestJSONHealthNoSSH(t *testing.T) {
	bin := binaryPath(t)
	root := configDir(t)

	// SSH_KEY not set — SSH connect will fail, but ok stays true.
	out, code := run(t, bin, root, "--json", "health")
	if code != 0 {
		t.Fatalf("expected exit 0 (SSH failure is target-level), got %d\noutput: %s", code, out)
	}

	var resp struct {
		OK      bool `json:"ok"`
		Results []struct {
			Target string `json:"target"`
			Status string `json:"status"`
			Error  string `json:"error,omitempty"`
		} `json:"results"`
	}
	if err := json.Unmarshal(out, &resp); err != nil {
		t.Fatalf("unmarshal: %v\noutput: %s", err, out)
	}
	if !resp.OK {
		t.Errorf("ok = false, want true (SSH failures are target-level)")
	}
	if len(resp.Results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(resp.Results))
	}
	if resp.Results[0].Target != "web" {
		t.Errorf("target = %q, want web", resp.Results[0].Target)
	}
	if resp.Results[0].Status != "unknown" {
		t.Errorf("status = %q, want unknown", resp.Results[0].Status)
	}
	if resp.Results[0].Error == "" {
		t.Errorf("expected error field to be set")
	}
}

// TestJSONStatusNoSSH verifies status --json returns ok:true with stopped state
// when SSH key is absent.
func TestJSONStatusNoSSH(t *testing.T) {
	bin := binaryPath(t)
	root := configDir(t)

	out, code := run(t, bin, root, "--json", "status")
	if code != 0 {
		t.Fatalf("expected exit 0, got %d\noutput: %s", code, out)
	}

	var resp struct {
		OK      bool `json:"ok"`
		Targets []struct {
			Service string `json:"service"`
			Running bool   `json:"running"`
			Health  string `json:"health"`
			Error   string `json:"error,omitempty"`
		} `json:"targets"`
	}
	if err := json.Unmarshal(out, &resp); err != nil {
		t.Fatalf("unmarshal: %v\noutput: %s", err, out)
	}
	if !resp.OK {
		t.Errorf("ok = false, want true")
	}
	if len(resp.Targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(resp.Targets))
	}
	if resp.Targets[0].Running {
		t.Errorf("running = true, want false when SSH unavailable")
	}
}

// TestFollowJSONIncompatible verifies --follow + --json returns exit 1 with ok:false.
func TestFollowJSONIncompatible(t *testing.T) {
	bin := binaryPath(t)
	root := configDir(t)

	out, code := run(t, bin, root, "--json", "logs", "web", "--follow")
	if code == 0 {
		t.Fatalf("expected non-zero exit for --follow + --json, got 0\noutput: %s", out)
	}

	var resp struct {
		OK   bool   `json:"ok"`
		Hint string `json:"hint"`
	}
	if err := json.Unmarshal(out, &resp); err != nil {
		t.Fatalf("unmarshal: %v\noutput: %s", err, out)
	}
	if resp.OK {
		t.Errorf("ok = true, want false")
	}
}

// TestExecDisabledByDefault verifies exec is rejected when permissions.exec is not set.
func TestExecDisabledByDefault(t *testing.T) {
	bin := binaryPath(t)
	root := configDir(t)

	out, code := run(t, bin, root, "--json", "exec", "web", "--", "ls")
	if code == 0 {
		t.Fatalf("expected non-zero exit for exec with exec:false, got 0\noutput: %s", out)
	}

	var resp struct {
		OK   bool   `json:"ok"`
		Hint string `json:"hint"`
	}
	if err := json.Unmarshal(out, &resp); err != nil {
		t.Fatalf("unmarshal: %v\noutput: %s", err, out)
	}
	if resp.OK {
		t.Errorf("ok = true, want false")
	}
}

// TestExecEnabledPermission verifies exec proceeds past permission check when exec:true.
// (It will fail at SSH connect, but permission gate must pass.)
func TestExecEnabledPermission(t *testing.T) {
	bin := binaryPath(t)

	root := t.TempDir()
	kbDir := filepath.Join(root, ".kb")
	if err := os.Mkdir(kbDir, 0o755); err != nil {
		t.Fatal(err)
	}
	yaml := `
registry: ghcr.io/test
targets:
  web:
    ssh:
      host: 1.2.3.4
      user: deploy
      key_env: SSH_KEY
    remote:
      compose_file: ~/app/docker-compose.yml
      service: web
    permissions:
      logs: true
      health: true
      exec: true
      rollback: true
`
	if err := os.WriteFile(filepath.Join(kbDir, "deploy.yaml"), []byte(yaml), 0o644); err != nil {
		t.Fatal(err)
	}

	out, code := run(t, bin, root, "--json", "exec", "web", "--", "ls")
	// With exec:true, it should fail at SSH level (no key), not permission level.
	// SSH failure is tool-level → exit 1 with ok:false and a SSH hint (not permission hint).
	if code == 0 {
		t.Fatalf("expected non-zero exit (no SSH key), got 0\noutput: %s", out)
	}

	var resp struct {
		OK   bool   `json:"ok"`
		Hint string `json:"hint"`
	}
	if err := json.Unmarshal(out, &resp); err != nil {
		t.Fatalf("unmarshal: %v\noutput: %s", err, out)
	}
	if resp.OK {
		t.Errorf("ok = true, want false")
	}
	// Must NOT be the "exec is disabled" message.
	if resp.Hint == `exec is disabled for target "web"` {
		t.Errorf("got permission error, want SSH error")
	}
}

// TestMissingConfig verifies exit 1 + ok:false when no config file found.
func TestMissingConfig(t *testing.T) {
	bin := binaryPath(t)
	root := t.TempDir() // no .kb/deploy.yaml

	out, code := run(t, bin, root, "--json", "health")
	if code == 0 {
		t.Fatalf("expected non-zero exit when config missing, got 0\noutput: %s", out)
	}

	var resp struct {
		OK   bool   `json:"ok"`
		Hint string `json:"hint"`
	}
	if err := json.Unmarshal(out, &resp); err != nil {
		t.Fatalf("unmarshal: %v\noutput: %s", err, out)
	}
	if resp.OK {
		t.Errorf("ok = true, want false")
	}
}
