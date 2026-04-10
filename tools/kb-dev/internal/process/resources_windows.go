//go:build windows

package process

// GetResourceUsage returns nil on Windows — resource monitoring via ps is
// not available. The status table shows "n/a" for CPU and memory columns.
func GetResourceUsage(_ int) *ResourceUsage {
	return nil
}
