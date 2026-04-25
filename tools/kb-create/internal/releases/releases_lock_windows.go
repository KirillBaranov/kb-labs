//go:build windows

package releases

import (
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows"
)

// acquireLock obtains an exclusive lock on <platformDir>/.releases.lock using
// LockFileEx — the Windows equivalent of flock(LOCK_EX).
func acquireLock(platformDir string) (func() error, error) {
	path := filepath.Join(platformDir, ".releases.lock")
	// #nosec G304,G302 -- lock file inside caller-owned platform dir.
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		return nil, fmt.Errorf("open lock: %w", err)
	}
	ol := new(windows.Overlapped)
	if err := windows.LockFileEx(windows.Handle(f.Fd()), windows.LOCKFILE_EXCLUSIVE_LOCK, 0, 1, 0, ol); err != nil {
		_ = f.Close()
		return nil, fmt.Errorf("LockFileEx: %w", err)
	}
	return func() error {
		if err := windows.UnlockFileEx(windows.Handle(f.Fd()), 0, 1, 0, ol); err != nil {
			_ = f.Close()
			return err
		}
		return f.Close()
	}, nil
}
