package logger

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestLogPath(t *testing.T) {
	got := LogPath("/tmp/logs", "rest")
	want := filepath.Join("/tmp/logs", "rest.log")
	if got != want {
		t.Errorf("LogPath = %q, want %q", got, want)
	}
}

func TestClear(t *testing.T) {
	dir := t.TempDir()
	svc := "test-svc"

	// Write some content.
	path := LogPath(dir, svc)
	if err := os.WriteFile(path, []byte("line1\nline2\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := Clear(dir, svc); err != nil {
		t.Fatalf("Clear() error: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(data) != 0 {
		t.Errorf("file should be empty after Clear, got %d bytes", len(data))
	}
}

func TestTail(t *testing.T) {
	dir := t.TempDir()
	svc := "test-svc"
	path := LogPath(dir, svc)

	// Write 10 lines.
	var content strings.Builder
	for i := 1; i <= 10; i++ {
		content.WriteString("line" + string(rune('0'+i)) + "\n")
	}
	if err := os.WriteFile(path, []byte(content.String()), 0o600); err != nil {
		t.Fatal(err)
	}

	// Tail 5.
	lines, err := Tail(dir, svc, 5)
	if err != nil {
		t.Fatalf("Tail() error: %v", err)
	}
	if len(lines) != 5 {
		t.Errorf("Tail(5) = %d lines, want 5", len(lines))
	}

	// Tail 100 from 10-line file.
	lines, err = Tail(dir, svc, 100)
	if err != nil {
		t.Fatalf("Tail(100) error: %v", err)
	}
	if len(lines) != 10 {
		t.Errorf("Tail(100) = %d lines, want 10", len(lines))
	}
}

func TestTailNoFile(t *testing.T) {
	dir := t.TempDir()
	lines, err := Tail(dir, "nonexistent", 5)
	if err != nil {
		t.Fatalf("Tail() error: %v", err)
	}
	if lines != nil {
		t.Errorf("expected nil for missing file, got %v", lines)
	}
}

func TestFollow(t *testing.T) {
	dir := t.TempDir()
	svc := "follow-test"
	path := LogPath(dir, svc)

	// Create empty log file.
	if err := os.WriteFile(path, nil, 0o600); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	var buf bytes.Buffer
	done := make(chan error, 1)

	go func() {
		done <- Follow(ctx, dir, svc, &buf)
	}()

	// Wait a bit, then write to the file.
	time.Sleep(300 * time.Millisecond)
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = f.WriteString("new line 1\n")
	_, _ = f.WriteString("new line 2\n")
	_ = f.Close()

	// Wait for Follow to pick up.
	time.Sleep(500 * time.Millisecond)
	cancel()

	if err := <-done; err != nil {
		t.Fatalf("Follow() error: %v", err)
	}

	output := buf.String()
	if !strings.Contains(output, "new line 1") || !strings.Contains(output, "new line 2") {
		t.Errorf("Follow output = %q, expected both lines", output)
	}
}

func TestEnsureDir(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "nested", "logs")
	if err := EnsureDir(dir); err != nil {
		t.Fatalf("EnsureDir() error: %v", err)
	}
	fi, err := os.Stat(dir)
	if err != nil {
		t.Fatalf("dir not created: %v", err)
	}
	if !fi.IsDir() {
		t.Error("expected directory")
	}
}
