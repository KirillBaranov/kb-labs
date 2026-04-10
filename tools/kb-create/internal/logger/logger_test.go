package logger

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestNewCreatesLogFile verifies that New creates a log file inside
// <platformDir>/.kb/logs/.
func TestNewCreatesLogFile(t *testing.T) {
	dir := t.TempDir()

	l, err := New(dir)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	defer func() { _ = l.Close() }()

	logPath := l.LogPath()
	if logPath == "" {
		t.Fatal("LogPath() returned empty string")
	}

	if _, err := os.Stat(logPath); err != nil {
		t.Errorf("log file not found at %q: %v", logPath, err)
	}
}

// TestNewLogPathUnderPlatformDir verifies the log file is created inside the
// expected subdirectory.
func TestNewLogPathUnderPlatformDir(t *testing.T) {
	dir := t.TempDir()

	l, err := New(dir)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	defer func() { _ = l.Close() }()

	wantPrefix := filepath.Join(dir, ".kb", "logs")
	if !strings.HasPrefix(l.LogPath(), wantPrefix) {
		t.Errorf("LogPath() = %q, want prefix %q", l.LogPath(), wantPrefix)
	}
}

// TestNewLogFileNameFormat verifies the log file name follows the
// install-<timestamp>.log convention.
func TestNewLogFileNameFormat(t *testing.T) {
	dir := t.TempDir()

	l, err := New(dir)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	defer func() { _ = l.Close() }()

	base := filepath.Base(l.LogPath())
	if !strings.HasPrefix(base, "install-") || !strings.HasSuffix(base, ".log") {
		t.Errorf("log file name %q does not match install-<ts>.log pattern", base)
	}
}

// TestNewPrintfWritesToFile verifies that Printf output reaches the log file.
func TestNewPrintfWritesToFile(t *testing.T) {
	dir := t.TempDir()

	l, err := New(dir)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	l.Printf("hello %s", "world")
	if err := l.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}

	data, err := os.ReadFile(l.LogPath())
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	if !strings.Contains(string(data), "hello world") {
		t.Errorf("log file content %q does not contain %q", string(data), "hello world")
	}
}

// TestNewDiscardLogPathEmpty verifies that NewDiscard returns "" for LogPath.
func TestNewDiscardLogPathEmpty(t *testing.T) {
	l := NewDiscard()
	if got := l.LogPath(); got != "" {
		t.Errorf("NewDiscard().LogPath() = %q, want \"\"", got)
	}
}

// TestNewDiscardWriteSucceeds verifies that writing to a discard logger does not error.
func TestNewDiscardWriteSucceeds(t *testing.T) {
	l := NewDiscard()
	l.Printf("this should not panic")
	if err := l.Close(); err != nil {
		t.Errorf("NewDiscard().Close() error = %v", err)
	}
}

// TestLatestLogPathEmpty verifies that LatestLogPath returns "" when no logs exist.
func TestLatestLogPathEmpty(t *testing.T) {
	dir := t.TempDir()
	if got := LatestLogPath(dir); got != "" {
		t.Errorf("LatestLogPath(empty dir) = %q, want \"\"", got)
	}
}

// TestLatestLogPathReturnsMostRecent verifies that LatestLogPath returns the
// lexicographically last file (most recent timestamp).
func TestLatestLogPathReturnsMostRecent(t *testing.T) {
	dir := t.TempDir()
	logsDir := filepath.Join(dir, ".kb", "logs")
	if err := os.MkdirAll(logsDir, 0o750); err != nil {
		t.Fatal(err)
	}

	// Create two log files — names sort chronologically.
	files := []string{
		"install-20260101-000000.log",
		"install-20260102-000000.log",
	}
	for _, name := range files {
		if err := os.WriteFile(filepath.Join(logsDir, name), []byte(name), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	got := LatestLogPath(dir)
	wantBase := "install-20260102-000000.log"
	if filepath.Base(got) != wantBase {
		t.Errorf("LatestLogPath() base = %q, want %q", filepath.Base(got), wantBase)
	}
}

// TestLatestLogPathSingleFile verifies LatestLogPath works with exactly one log.
func TestLatestLogPathSingleFile(t *testing.T) {
	dir := t.TempDir()
	logsDir := filepath.Join(dir, ".kb", "logs")
	if err := os.MkdirAll(logsDir, 0o750); err != nil {
		t.Fatal(err)
	}

	name := "install-20260101-120000.log"
	if err := os.WriteFile(filepath.Join(logsDir, name), []byte("data"), 0o600); err != nil {
		t.Fatal(err)
	}

	got := LatestLogPath(dir)
	if filepath.Base(got) != name {
		t.Errorf("LatestLogPath() base = %q, want %q", filepath.Base(got), name)
	}
}
