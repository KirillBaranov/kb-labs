// Package logger manages per-service log files with tail and follow support.
package logger

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

// LogPath returns the log file path for a service.
func LogPath(logsDir, service string) string {
	return filepath.Join(logsDir, service+".log")
}

// EnsureDir creates the logs directory if it doesn't exist.
func EnsureDir(logsDir string) error {
	return os.MkdirAll(logsDir, 0o750)
}

// Clear truncates a service's log file.
func Clear(logsDir, service string) error {
	path := LogPath(logsDir, service)
	return os.WriteFile(path, nil, 0o600)
}

// Tail returns the last n lines of a service's log file.
func Tail(logsDir, service string, n int) ([]string, error) {
	path := LogPath(logsDir, service)

	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("open log: %w", err)
	}
	defer func() { _ = f.Close() }()

	// Read all lines and take last n.
	var lines []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("read log: %w", err)
	}

	if len(lines) <= n {
		return lines, nil
	}
	return lines[len(lines)-n:], nil
}

// Follow streams new lines from a log file to the writer until ctx is cancelled.
func Follow(ctx context.Context, logsDir, service string, w io.Writer) error {
	path := LogPath(logsDir, service)

	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open log for follow: %w", err)
	}
	defer func() { _ = f.Close() }()

	// Seek to end.
	if _, err := f.Seek(0, io.SeekEnd); err != nil {
		return fmt.Errorf("seek to end: %w", err)
	}

	reader := bufio.NewReader(f)
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			for {
				line, err := reader.ReadString('\n')
				if len(line) > 0 {
					_, _ = fmt.Fprint(w, line)
				}
				if err != nil {
					break // EOF or error — wait for more
				}
			}
		}
	}
}
