//go:build !windows

package process

import (
	"os/exec"
	"syscall"
)

// setProcAttrs assigns the process to its own process group on Unix.
// This allows the entire process tree to be killed atomically via Kill(-pgid).
func setProcAttrs(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

// getPgid returns the process group ID for the given PID.
func getPgid(pid int) (int, error) {
	return syscall.Getpgid(pid)
}
