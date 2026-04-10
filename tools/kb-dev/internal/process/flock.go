package process

import (
	"fmt"
	"os"
	"path/filepath"
	"time"
)

const defaultLockTimeout = 30 * time.Second

// FileLock is a cross-process advisory lock.
// Prevents multiple kb-dev instances from starting/stopping services concurrently.
type FileLock struct {
	path string
	file *os.File
}

// AcquireLock creates or opens a lock file and acquires an exclusive lock.
// Retries with polling until timeout (default 30s). Returns a clear error
// if another kb-dev instance holds the lock.
func AcquireLock(pidDir string) (*FileLock, error) {
	return AcquireLockTimeout(pidDir, defaultLockTimeout)
}

// AcquireLockTimeout is like AcquireLock but with a custom timeout.
func AcquireLockTimeout(pidDir string, timeout time.Duration) (*FileLock, error) {
	lockPath := filepath.Join(pidDir, "kb-dev.lock")

	if err := os.MkdirAll(pidDir, 0o750); err != nil {
		return nil, fmt.Errorf("create lock dir: %w", err)
	}

	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open lock file: %w", err)
	}

	// Try non-blocking first — fast path.
	if flockLock(f) == nil {
		return &FileLock{path: lockPath, file: f}, nil
	}

	// Lock is held — poll with timeout.
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		time.Sleep(500 * time.Millisecond)
		if flockLock(f) == nil {
			return &FileLock{path: lockPath, file: f}, nil
		}
	}

	_ = f.Close()
	return nil, fmt.Errorf("lock timeout after %s: another kb-dev instance is running. Wait or kill it", timeout)
}

// TryLock attempts to acquire the lock without blocking.
// Returns nil lock and no error if already held by another process.
func TryLock(pidDir string) (*FileLock, error) {
	lockPath := filepath.Join(pidDir, "kb-dev.lock")

	if err := os.MkdirAll(pidDir, 0o750); err != nil {
		return nil, fmt.Errorf("create lock dir: %w", err)
	}

	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open lock file: %w", err)
	}

	if flockLock(f) != nil {
		_ = f.Close()
		return nil, nil // lock held by another process
	}

	return &FileLock{path: lockPath, file: f}, nil
}

// Release releases the lock and closes the file.
func (l *FileLock) Release() {
	if l.file != nil {
		flockUnlock(l.file)
		_ = l.file.Close()
	}
}
