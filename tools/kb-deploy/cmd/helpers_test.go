package cmd

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/kb-labs/kb-deploy/internal/config"
)

func TestReadSSHKey_FromFile(t *testing.T) {
	tmp := t.TempDir()
	keyFile := filepath.Join(tmp, "id_ed25519")
	if err := os.WriteFile(keyFile, []byte("PEM-CONTENT"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("TEST_SSH_KEY_PATH", keyFile)

	pem, err := readSSHKey(config.SSHConfig{KeyPathEnv: "TEST_SSH_KEY_PATH"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pem != "PEM-CONTENT" {
		t.Errorf("got %q, want PEM-CONTENT", pem)
	}
}

func TestReadSSHKey_FallbackToKeyEnv(t *testing.T) {
	t.Setenv("TEST_SSH_KEY", "INLINE-PEM")

	pem, err := readSSHKey(config.SSHConfig{KeyEnv: "TEST_SSH_KEY"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pem != "INLINE-PEM" {
		t.Errorf("got %q, want INLINE-PEM", pem)
	}
}

func TestReadSSHKey_FilePreferredOverInline(t *testing.T) {
	tmp := t.TempDir()
	keyFile := filepath.Join(tmp, "id_ed25519")
	if err := os.WriteFile(keyFile, []byte("FILE-PEM"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("TEST_SSH_KEY_PATH", keyFile)
	t.Setenv("TEST_SSH_KEY", "INLINE-PEM")

	pem, err := readSSHKey(config.SSHConfig{KeyPathEnv: "TEST_SSH_KEY_PATH", KeyEnv: "TEST_SSH_KEY"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pem != "FILE-PEM" {
		t.Errorf("key_path_env should take priority: got %q, want FILE-PEM", pem)
	}
}

func TestReadSSHKey_FileNotFound(t *testing.T) {
	t.Setenv("TEST_SSH_KEY_PATH", "/nonexistent/path/key")

	_, err := readSSHKey(config.SSHConfig{KeyPathEnv: "TEST_SSH_KEY_PATH"})
	if err == nil {
		t.Fatal("expected error for missing key file")
	}
}

func TestReadSSHKey_NeitherSet(t *testing.T) {
	os.Unsetenv("TEST_SSH_KEY_PATH")
	os.Unsetenv("TEST_SSH_KEY")

	_, err := readSSHKey(config.SSHConfig{KeyPathEnv: "TEST_SSH_KEY_PATH", KeyEnv: "TEST_SSH_KEY"})
	if err == nil {
		t.Fatal("expected error when no key is configured")
	}
}

func TestReadSSHKey_BothEnvsEmpty(t *testing.T) {
	_, err := readSSHKey(config.SSHConfig{})
	if err == nil {
		t.Fatal("expected error when SSHConfig has no key config")
	}
}
