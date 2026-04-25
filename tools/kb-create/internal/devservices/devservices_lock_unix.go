//go:build !windows

package devservices

import (
	"fmt"
	"os"
	"path/filepath"
	"syscall"
)

// acquireLock blocks on an exclusive flock over .kb/devservices.lock.
func acquireLock(platformDir string) (func() error, error) {
	if err := os.MkdirAll(filepath.Join(platformDir, ".kb"), 0o750); err != nil {
		return nil, err
	}
	path := filepath.Join(platformDir, ".kb", "devservices.lock")
	// #nosec G302,G304 -- lock file inside caller-owned platform dir.
	fd, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		return nil, fmt.Errorf("open devservices lock: %w", err)
	}
	if err := syscall.Flock(int(fd.Fd()), syscall.LOCK_EX); err != nil {
		_ = fd.Close()
		return nil, fmt.Errorf("flock: %w", err)
	}
	return func() error {
		if err := syscall.Flock(int(fd.Fd()), syscall.LOCK_UN); err != nil {
			_ = fd.Close()
			return err
		}
		return fd.Close()
	}, nil
}
