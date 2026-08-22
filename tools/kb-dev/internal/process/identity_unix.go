//go:build !windows

package process

import (
	"os/exec"
	"strconv"
	"strings"
)

// ProcessIdentity returns the OS-reported process start identity. It is
// intentionally opaque: callers only compare it with a later observation to
// detect PID reuse.
func ProcessIdentity(pid int) string {
	if pid <= 0 {
		return ""
	}
	out, err := exec.Command("ps", "-p", strconv.Itoa(pid), "-o", "lstart=").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
