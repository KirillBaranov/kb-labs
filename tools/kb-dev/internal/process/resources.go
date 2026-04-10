package process

import "fmt"

// ResourceUsage holds CPU and memory stats for a process.
type ResourceUsage struct {
	CPUPercent float64 // e.g. 58.1
	RSSBytes   int64   // resident set size in bytes
}

// FormatMemory formats bytes into a human-readable string.
func FormatMemory(bytes int64) string {
	switch {
	case bytes >= 1024*1024*1024:
		return fmt.Sprintf("%.1fGB", float64(bytes)/(1024*1024*1024))
	case bytes >= 1024*1024:
		return fmt.Sprintf("%dMB", bytes/(1024*1024))
	case bytes >= 1024:
		return fmt.Sprintf("%dKB", bytes/1024)
	default:
		return fmt.Sprintf("%dB", bytes)
	}
}
