//go:build !windows

package releases

import (
	"fmt"
	"os"
	"syscall"
)

// deviceOf returns the filesystem device id of the given path.
func deviceOf(path string) (uint64, error) {
	abs, err := absPath(path)
	if err != nil {
		return 0, err
	}
	info, err := os.Stat(abs)
	if err != nil {
		return 0, fmt.Errorf("stat %s: %w", abs, err)
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		// Non-Unix filesystems — skip the guard.
		return 0, nil
	}
	return uint64(stat.Dev), nil //nolint:unconvert // Dev is int32 on darwin, uint64 on linux
}
