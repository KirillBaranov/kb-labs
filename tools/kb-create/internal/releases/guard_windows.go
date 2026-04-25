//go:build windows

package releases

import (
	"fmt"
	"os"
)

// deviceOf returns 0 on Windows — filesystem-device checks are not supported.
// The EnsureSameFilesystem guard is effectively a no-op on Windows because
// atomic rename (os.Rename) is guaranteed within the same volume and Windows
// does not expose a portable device ID equivalent to Unix Stat_t.Dev.
func deviceOf(path string) (uint64, error) {
	abs, err := absPath(path)
	if err != nil {
		return 0, err
	}
	if _, err := os.Stat(abs); err != nil {
		return 0, fmt.Errorf("stat %s: %w", abs, err)
	}
	return 0, nil
}
