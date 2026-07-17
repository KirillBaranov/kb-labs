package netoffset

import (
	"encoding/json"
	"fmt"
	"hash/crc32"
	"net"
	"os"
	"path/filepath"
)

// baseOffset/offsetRange/offsetStep bound the deterministic starting point
// derived from an alias: base + [0, range) stepped by offsetStep, e.g.
// 1000, 1010, 1020, ... 9990. Chosen to stay clear of common low/well-known
// ports without any special-casing.
const (
	baseOffset  = 1000
	offsetRange = 9000
	offsetStep  = 10
	maxAttempts = 50
)

// resolvedOffsetFile is the cache written under <rootDir>/.kb/tmp/, so a
// project's resolved offset is stable across repeated `start`/`switch` runs
// and only recomputed when the cached ports are no longer actually free
// (something else grabbed one).
const resolvedOffsetFile = "net-offset.json"

type cachedOffset struct {
	Alias  string `json:"alias"`
	Offset int    `json:"offset"`
}

// DeriveOffset returns a deterministic starting-point offset for alias.
// It is NOT a guarantee of availability — callers must still verify the
// resulting ports are free (see Resolve).
func DeriveOffset(alias string) int {
	h := crc32.ChecksumIEEE([]byte(alias))
	return baseOffset + int(h%uint32(offsetRange/offsetStep))*offsetStep
}

// Resolve returns a working offset for alias: it starts from DeriveOffset,
// re-uses the cached offset from a previous run when its ports are still
// free, and otherwise probes candidate offsets (stepping by offsetStep) until
// it finds one where every port in ports is actually bindable. This handles
// the case where the hash-derived (or previously cached) offset collides
// with something else running on the machine — not just other registered
// kb-labs projects.
//
// pidDir is the project's state directory (<rootDir>/.kb/tmp per Settings.PIDDir)
// used to cache the resolved offset between runs.
func Resolve(alias string, pidDir string, ports func(offset int) []int) (int, error) {
	if cached, ok := readCache(pidDir, alias); ok && allFree(ports(cached)) {
		return cached, nil
	}

	start := DeriveOffset(alias)
	for attempt := 0; attempt < maxAttempts; attempt++ {
		offset := start + attempt*offsetStep
		if allFree(ports(offset)) {
			writeCache(pidDir, alias, offset)
			return offset, nil
		}
	}

	return 0, fmt.Errorf(
		"could not find %d free ports for project %q after %d attempts starting at offset %d",
		len(ports(start)), alias, maxAttempts, start,
	)
}

// allFree reports whether every port in ports is currently bindable.
func allFree(ports []int) bool {
	for _, p := range ports {
		if !isPortFree(p) {
			return false
		}
	}
	return true
}

// isPortFree probes a TCP port via a real bind-and-close, not just a dial —
// a dial only detects ports something is actively listening on, whereas a
// bind also fails when the OS has the port reserved (TIME_WAIT, another
// process holding it without accepting yet, etc.).
//
// Binds "tcp4" on 127.0.0.1 specifically — services are health-probed on
// localhost (see health/probe.go), and a generic "tcp" bind on ":port"
// resolves differently across hosts depending on the system's IPv6
// dual-stack/bindv6only setting: on a host where dual-stack binding isn't
// available, an IPv6-only listener and an IPv4-only listener can coexist on
// the same port without ever colliding, so this check would report a port
// free that a real service (or this package's own tests) is actually using.
// Pinning both sides to tcp4/127.0.0.1 keeps the check consistent regardless
// of host IPv6 configuration.
func isPortFree(port int) bool {
	ln, err := net.Listen("tcp4", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return false
	}
	_ = ln.Close()
	return true
}

func cachePath(pidDir string) string {
	return filepath.Join(pidDir, resolvedOffsetFile)
}

func readCache(pidDir, alias string) (int, bool) {
	data, err := os.ReadFile(cachePath(pidDir)) // #nosec G304 -- pidDir is caller-resolved, not attacker input
	if err != nil {
		return 0, false
	}
	var c cachedOffset
	if err := json.Unmarshal(data, &c); err != nil || c.Alias != alias {
		return 0, false
	}
	return c.Offset, true
}

func writeCache(pidDir, alias string, offset int) {
	_ = os.MkdirAll(pidDir, 0o750)
	data, err := json.Marshal(cachedOffset{Alias: alias, Offset: offset})
	if err != nil {
		return
	}
	// Best-effort — a failed cache write just means re-resolving next run.
	_ = os.WriteFile(cachePath(pidDir), data, 0o600)
}
