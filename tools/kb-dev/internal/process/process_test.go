package process

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSpawnSimpleCommand(t *testing.T) {
	dir := t.TempDir()
	logFile := filepath.Join(dir, "test.log")

	result, err := Spawn(SpawnOpts{
		Command: "sleep 60",
		LogFile: logFile,
	})
	if err != nil {
		t.Fatalf("Spawn() error: %v", err)
	}
	defer func() { _ = KillGroup(result.PGID, 2*time.Second) }()

	if result.PID == 0 {
		t.Error("PID should not be 0")
	}
	if !IsAlive(result.PID) {
		t.Error("spawned process should be alive")
	}
}

func TestSpawnCompoundCommand(t *testing.T) {
	dir := t.TempDir()
	logFile := filepath.Join(dir, "test.log")

	res, err := Spawn(SpawnOpts{
		Command: "echo hello && echo world",
		LogFile: logFile,
	})
	if err != nil {
		t.Fatalf("Spawn() error: %v", err)
	}
	_, _ = res.Process.Wait()

	data, err := os.ReadFile(logFile)
	if err != nil {
		t.Fatal(err)
	}
	if len(data) == 0 {
		t.Error("expected log output from compound command")
	}
}

func TestSpawnWithEnv(t *testing.T) {
	dir := t.TempDir()
	logFile := filepath.Join(dir, "test.log")

	result, err := Spawn(SpawnOpts{
		Command: "echo $TEST_VAR_KB_DEV",
		Env:     map[string]string{"TEST_VAR_KB_DEV": "hello_from_test"},
		LogFile: logFile,
	})
	if err != nil {
		t.Fatalf("Spawn() error: %v", err)
	}

	// Wait for command to finish.
	_, _ = result.Process.Wait()

	data, err := os.ReadFile(logFile)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "hello_from_test\n" {
		t.Errorf("env var not passed, got: %q", string(data))
	}
}

func TestKillGroup(t *testing.T) {
	dir := t.TempDir()
	logFile := filepath.Join(dir, "test.log")

	result, err := Spawn(SpawnOpts{
		Command: "sleep 60",
		LogFile: logFile,
	})
	if err != nil {
		t.Fatalf("Spawn() error: %v", err)
	}

	if err := KillGroup(result.PGID, 2*time.Second); err != nil {
		t.Fatalf("KillGroup() error: %v", err)
	}

	// Wait for OS to reap the process.
	time.Sleep(500 * time.Millisecond)

	if IsAlive(result.PID) {
		// Process may linger as zombie until parent waits — try reaping.
		_, _ = result.Process.Wait()
		time.Sleep(200 * time.Millisecond)
		if IsAlive(result.PID) {
			t.Error("process should be dead after KillGroup")
		}
	}
}

func TestIsAlive(t *testing.T) {
	// Current process should be alive.
	if !IsAlive(os.Getpid()) {
		t.Error("current process should be alive")
	}

	// PID 999999999 should not be alive.
	if IsAlive(999999999) {
		t.Error("PID 999999999 should not be alive")
	}
}

func TestPIDRoundTrip(t *testing.T) {
	dir := t.TempDir()

	original := NewPIDInfo("test-svc", 12345, 12345, "echo hello")

	if err := WritePID(dir, original); err != nil {
		t.Fatalf("WritePID() error: %v", err)
	}

	loaded, err := ReadPID(dir, "test-svc")
	if err != nil {
		t.Fatalf("ReadPID() error: %v", err)
	}

	if loaded.PID != original.PID {
		t.Errorf("PID = %d, want %d", loaded.PID, original.PID)
	}
	if loaded.PGID != original.PGID {
		t.Errorf("PGID = %d, want %d", loaded.PGID, original.PGID)
	}
	if loaded.Service != "test-svc" {
		t.Errorf("Service = %q, want test-svc", loaded.Service)
	}
	if loaded.User == "" {
		t.Error("User should not be empty")
	}
	if loaded.Command != "echo hello" {
		t.Errorf("Command = %q, want 'echo hello'", loaded.Command)
	}
}

func TestReadPIDMissing(t *testing.T) {
	info, err := ReadPID(t.TempDir(), "nonexistent")
	if err != nil {
		t.Fatalf("ReadPID() error: %v", err)
	}
	if info != nil {
		t.Error("expected nil for missing PID file")
	}
}

func TestReadPIDLegacy(t *testing.T) {
	dir := t.TempDir()
	// Write a legacy bare-number PID file.
	path := filepath.Join(dir, "legacy.pid")
	if err := os.WriteFile(path, []byte("12345\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	info, err := ReadPID(dir, "legacy")
	if err != nil {
		t.Fatalf("ReadPID() error: %v", err)
	}
	if info.PID != 12345 {
		t.Errorf("PID = %d, want 12345", info.PID)
	}
}

func TestRemovePID(t *testing.T) {
	dir := t.TempDir()
	info := NewPIDInfo("to-remove", 1, 1, "echo")
	if err := WritePID(dir, info); err != nil {
		t.Fatal(err)
	}

	if err := RemovePID(dir, "to-remove"); err != nil {
		t.Fatalf("RemovePID() error: %v", err)
	}

	// File should be gone.
	if _, err := os.Stat(filepath.Join(dir, "to-remove.pid")); !os.IsNotExist(err) {
		t.Error("PID file should be removed")
	}
}

func TestReconcile(t *testing.T) {
	dir := t.TempDir()

	// Write PID for current process (alive).
	alive := NewPIDInfo("alive-svc", os.Getpid(), os.Getpid(), "self")
	if err := WritePID(dir, alive); err != nil {
		t.Fatal(err)
	}

	// Write PID for a dead process.
	dead := NewPIDInfo("dead-svc", 999999999, 999999999, "nonexistent")
	if err := WritePID(dir, dead); err != nil {
		t.Fatal(err)
	}

	result, err := Reconcile(dir)
	if err != nil {
		t.Fatalf("Reconcile() error: %v", err)
	}

	if _, ok := result["alive-svc"]; !ok {
		t.Error("alive-svc should be in reconciled results")
	}
	if _, ok := result["dead-svc"]; ok {
		t.Error("dead-svc should NOT be in reconciled results")
	}

	// Dead PID file should be removed.
	if _, err := os.Stat(filepath.Join(dir, "dead-svc.pid")); !os.IsNotExist(err) {
		t.Error("stale PID file should be cleaned up")
	}
}

func TestBuildShellArgs(t *testing.T) {
	tests := []struct {
		command      string
		wantExec     bool
		wantCompound bool
	}{
		{"node server.js", true, false},
		{"echo hello && echo world", false, true},
		{"cat file | grep pattern", false, true},
		{"echo a; echo b", false, true},
	}
	for _, tt := range tests {
		args := buildShellArgs(tt.command)
		hasExec := len(args) == 3 && args[2][:5] == "exec "
		if tt.wantExec && !hasExec {
			t.Errorf("buildShellArgs(%q) should prepend exec", tt.command)
		}
		if tt.wantCompound && hasExec {
			t.Errorf("buildShellArgs(%q) should NOT prepend exec for compound", tt.command)
		}
	}
}

func TestSetEnvVar(t *testing.T) {
	env := []string{"A=1", "B=2", "PATH=/usr/bin"}

	// Replace existing.
	env = setEnvVar(env, "B", "99")
	found := false
	for _, e := range env {
		if e == "B=99" {
			found = true
		}
		if e == "B=2" {
			t.Error("old B=2 should be replaced")
		}
	}
	if !found {
		t.Error("B=99 should be in env")
	}

	// Add new.
	env = setEnvVar(env, "C", "3")
	found = false
	for _, e := range env {
		if e == "C=3" {
			found = true
		}
	}
	if !found {
		t.Error("C=3 should be added")
	}
}
