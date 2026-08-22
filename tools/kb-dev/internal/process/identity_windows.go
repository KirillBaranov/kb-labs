//go:build windows

package process

// ProcessIdentity is best-effort on Windows. PID ownership is still checked
// through the process handle and the command metadata in PIDInfo.
func ProcessIdentity(_ int) string { return "" }
