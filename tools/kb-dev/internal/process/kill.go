package process

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

const pollInterval = 100 * time.Millisecond

// KillGroup terminates the process group with graceful shutdown.
// Sends SIGTERM (Unix) or taskkill (Windows), waits up to gracePeriod,
// then force-kills if the group is still alive.
func KillGroup(pgid int, gracePeriod time.Duration) error {
	return killGroup(pgid, pgid, gracePeriod)
}

// KillGroupWithPID is like KillGroup but also passes the root PID.
// On Windows, the PID is used since process groups do not exist.
func KillGroupWithPID(pgid int, pid int, gracePeriod time.Duration) error {
	return killGroup(pgid, pid, gracePeriod)
}

// KillPort finds processes listening on the given port and terminates them.
// Used for --force cleanup of processes that conflict with a service's port.
func KillPort(port int) error {
	pids := GetListenerPIDs(port)
	if len(pids) == 0 {
		return nil
	}
	killPort(pids)
	return nil
}

// IsAlive reports whether the process with the given PID is still running.
func IsAlive(pid int) bool {
	return isAlive(pid)
}

// GetListenerPIDs finds PIDs listening on a TCP port.
// Uses lsof on Unix and netstat on Windows.
func GetListenerPIDs(port int) []int {
	return getListenerPIDs(port)
}

// getListenerPIDsLsof is the lsof-based implementation used on Unix.
func getListenerPIDsLsof(port int) []int {
	out, err := exec.Command("lsof", "-ti", fmt.Sprintf(":%d", port), "-sTCP:LISTEN").Output()
	if err != nil {
		return nil
	}

	var pids []int
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		pid, err := strconv.Atoi(line)
		if err != nil {
			continue
		}
		pids = append(pids, pid)
	}
	return pids
}
