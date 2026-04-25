//go:build !windows

package releases

import (
	"fmt"
	"os"
	"path/filepath"
	"syscall"
)

// acquireLock obtains an exclusive flock on <platformDir>/.releases.lock and
// returns an unlock function. Blocks until the lock is available.
func acquireLock(platformDir string) (func() error, error) {
	path := filepath.Join(platformDir, ".releases.lock")
	// #nosec G304,G302 -- lock file inside caller-owned platform dir.
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		return nil, fmt.Errorf("open lock: %w", err)
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX); err != nil {
		_ = f.Close()
		return nil, fmt.Errorf("flock: %w", err)
	}
	return func() error {
		if err := syscall.Flock(int(f.Fd()), syscall.LOCK_UN); err != nil {
			_ = f.Close()
			return err
		}
		return f.Close()
	}, nil
}
