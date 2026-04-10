//go:build !windows

package process

import (
	"os/exec"
	"strconv"
	"strings"
)

// GetResourceUsage reads CPU% and RSS for a given PID using ps.
// Returns nil if the process is not found or not running.
func GetResourceUsage(pid int) *ResourceUsage {
	if pid <= 0 {
		return nil
	}

	// ps -p PID -o %cpu=,rss= → "58.1 205856\n"
	// rss is in kilobytes on macOS and Linux.
	out, err := exec.Command("ps", "-p", strconv.Itoa(pid), "-o", "%cpu=,rss=").Output()
	if err != nil {
		return nil
	}

	fields := strings.Fields(strings.TrimSpace(string(out)))
	if len(fields) < 2 {
		return nil
	}

	cpu, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return nil
	}

	rssKB, err := strconv.ParseInt(fields[1], 10, 64)
	if err != nil {
		return nil
	}

	return &ResourceUsage{
		CPUPercent: cpu,
		RSSBytes:   rssKB * 1024,
	}
}
