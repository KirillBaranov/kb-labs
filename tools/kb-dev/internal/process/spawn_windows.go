//go:build windows

package process

import (
	"os/exec"
	"syscall"
)

// setProcAttrs creates a new process group on Windows so that taskkill /T
// can terminate the entire process tree.
func setProcAttrs(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: 0x00000200, // CREATE_NEW_PROCESS_GROUP
	}
}

// getPgid returns pid as the group ID on Windows — process groups are not
// tracked separately, so the root PID is used as the group identifier.
func getPgid(pid int) (int, error) {
	return pid, nil
}
