//go:build windows

package devservices

import (
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows"
)

// acquireLock blocks on an exclusive lock over .kb/devservices.lock using
// LockFileEx — the Windows equivalent of flock(LOCK_EX).
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
	ol := new(windows.Overlapped)
	if err := windows.LockFileEx(windows.Handle(fd.Fd()), windows.LOCKFILE_EXCLUSIVE_LOCK, 0, 1, 0, ol); err != nil {
		_ = fd.Close()
		return nil, fmt.Errorf("LockFileEx: %w", err)
	}
	return func() error {
		if err := windows.UnlockFileEx(windows.Handle(fd.Fd()), 0, 1, 0, ol); err != nil {
			_ = fd.Close()
			return err
		}
		return fd.Close()
	}, nil
}
