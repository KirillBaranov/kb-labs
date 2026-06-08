// Package netoffset applies the KB_NET_OFFSET virtual-network port shift on the
// kb-dev side, mirroring the platform transport adapter. KB_NET_OFFSET is a
// LOCAL mechanism for running multiple isolated environments on one host; it is
// 0 in cloud/k8s (isolation there comes from namespace/DNS). The same offset
// must shift kb-dev's health-probe ports AND the ports services bind, so kb-dev
// probes exactly where a service listens.
package netoffset

import (
	"os"
	"regexp"
	"strconv"
)

// portRe matches a ":<port>" segment (2–5 digits) not followed by another digit
// — i.e. an actual port in "http://host:7777/path" or "host:7777", never a path
// or scheme colon.
var portRe = regexp.MustCompile(`:(\d{2,5})(\D|$)`)

// FromEnv returns the KB_NET_OFFSET value (0 when unset or invalid).
func FromEnv() int {
	if v := os.Getenv("KB_NET_OFFSET"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return 0
}

// Shift adds offset to the port found in a target string (a health-check URL or
// host:port). Strings without a port (e.g. unix-socket-style "/health") and an
// offset of 0 are returned unchanged.
func Shift(target string, offset int) string {
	if offset == 0 || target == "" {
		return target
	}
	return portRe.ReplaceAllStringFunc(target, func(m string) string {
		sub := portRe.FindStringSubmatch(m)
		port, _ := strconv.Atoi(sub[1])
		return ":" + strconv.Itoa(port+offset) + sub[2]
	})
}
