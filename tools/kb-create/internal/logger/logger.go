// Package logger provides a dual-output logger that writes to both stderr
// and a timestamped log file inside the platform directory.
package logger

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

// Logger writes to both stderr and a log file simultaneously.
type Logger struct {
	w    io.Writer
	file *os.File
}

// New creates a logger that writes to stderr and to <platformDir>/.kb/logs/install-<ts>.log.
func New(platformDir string) (*Logger, error) {
	logsDir := filepath.Join(platformDir, ".kb", "logs")
	if err := os.MkdirAll(logsDir, 0o750); err != nil {
		return nil, fmt.Errorf("create logs dir: %w", err)
	}

	ts := time.Now().Format("20060102-150405")
	logPath := filepath.Join(logsDir, fmt.Sprintf("install-%s.log", ts))

	// #nosec G304 -- logPath is constructed from trusted platformDir and timestamp.
	f, err := os.Create(logPath)
	if err != nil {
		return nil, fmt.Errorf("create log file: %w", err)
	}

	return &Logger{
		w:    io.MultiWriter(os.Stderr, f),
		file: f,
	}, nil
}

// NewDiscard returns a logger that only writes to a temp file (used when no platform dir yet).
func NewDiscard() *Logger {
	return &Logger{w: io.Discard}
}

// LogPath returns the path of the current log file, or empty string if discarded.
func (l *Logger) LogPath() string {
	if l.file == nil {
		return ""
	}
	return l.file.Name()
}

// Write implements io.Writer — forwards to the underlying multi-writer.
func (l *Logger) Write(p []byte) (n int, err error) {
	return l.w.Write(p)
}

// Printf writes a formatted line to the log.
func (l *Logger) Printf(format string, args ...any) {
	_, _ = fmt.Fprintf(l.w, format+"\n", args...)
}

// Close flushes and closes the log file.
func (l *Logger) Close() error {
	if l.file != nil {
		return l.file.Close()
	}
	return nil
}

// LatestLogPath returns the path to the most recent install log in <platformDir>.
// Returns "" if no logs exist.
func LatestLogPath(platformDir string) string {
	logsDir := filepath.Join(platformDir, ".kb", "logs")
	entries, err := os.ReadDir(logsDir)
	if err != nil || len(entries) == 0 {
		return ""
	}
	// ReadDir returns sorted by name; install-<ts> logs sort chronologically.
	latest := ""
	for _, e := range entries {
		if !e.IsDir() {
			latest = filepath.Join(logsDir, e.Name())
		}
	}
	return latest
}
