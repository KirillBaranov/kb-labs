//go:build !windows

package releases

import (
	"fmt"
	"syscall"
)

// FreeBytes returns the number of bytes available to an unprivileged user on the
// filesystem that backs path. Used by the pre-install disk guard so a release is
// never half-written into a full disk (which cascades into pnpm failures, a
// crashed MongoDB, and an unwritable devservices.yaml).
func FreeBytes(path string) (uint64, error) {
	abs, err := absPath(path)
	if err != nil {
		return 0, err
	}
	var st syscall.Statfs_t
	if err := syscall.Statfs(abs, &st); err != nil {
		return 0, fmt.Errorf("statfs %s: %w", abs, err)
	}
	// Bavail is blocks available to non-root; Bsize is the block size in bytes.
	return uint64(st.Bavail) * uint64(st.Bsize), nil //nolint:unconvert // types vary by GOOS
}
