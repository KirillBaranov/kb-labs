//go:build windows

package releases

// FreeBytes returns a large sentinel on Windows — the pre-install disk guard is a
// no-op there, mirroring EnsureSameFilesystem. Returning a high value means the
// guard's threshold check always passes.
func FreeBytes(path string) (uint64, error) {
	return 1 << 62, nil
}
