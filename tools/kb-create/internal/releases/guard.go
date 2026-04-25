package releases

import (
	"fmt"
	"os"
	"path/filepath"
)

// EnsureSameFilesystem verifies that releases/ and services/ share a filesystem
// so that the atomic rename performed by Swap is guaranteed POSIX-atomic (D21).
// A mismatch indicates that one of the directories is on a Docker volume mount
// or a tmpfs separate from the other; on such a layout, os.Rename returns EXDEV
// during swap and the service is left in an inconsistent state.
//
// Both directories must already exist. Creates them if missing.
func EnsureSameFilesystem(releasesDir, servicesDir string) error {
	if err := os.MkdirAll(releasesDir, 0o750); err != nil {
		return fmt.Errorf("create releases dir: %w", err)
	}
	if err := os.MkdirAll(servicesDir, 0o750); err != nil {
		return fmt.Errorf("create services dir: %w", err)
	}

	devA, err := deviceOf(releasesDir)
	if err != nil {
		return err
	}
	devB, err := deviceOf(servicesDir)
	if err != nil {
		return err
	}
	if devA != devB {
		return fmt.Errorf(
			"releases/ and services/ must be on the same filesystem "+
				"(got devices %d and %d for %s and %s). "+
				"This typically happens when one is on a Docker volume mount and the other is on the host filesystem. "+
				"Fix the layout so both live under a single mount point.",
			devA, devB, releasesDir, servicesDir,
		)
	}
	return nil
}

// deviceOf is implemented in guard_unix.go (Unix) and guard_windows.go (Windows)
// via build tags.

// absPath returns the absolute path of p, used by platform-specific deviceOf impls.
func absPath(p string) (string, error) {
	return filepath.Abs(p)
}
