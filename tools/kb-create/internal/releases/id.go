// Package releases manages versioned service installations under ~/kb-platform/releases/.
//
// Each install-service invocation produces a directory releases/<id>/ containing an
// isolated node_modules, a release.json manifest, and configuration files. The id is
// derived deterministically from inputs so repeated invocations with the same arguments
// are idempotent no-ops (ADR-0014 §Release ID).
package releases

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
)

// ComputeID returns a deterministic release identifier of the form
// "<service-short>-<version>-<hash8>". The hash is SHA-256 of a canonical string
// built from service@version plus sorted adapter and plugin specs, so two calls
// with identical inputs always produce the same id.
//
// Examples:
//
//	ComputeID("@kb-labs/gateway", "1.2.3", ...) → "gateway-1.2.3-a3f2b1c9"
//	ComputeID("@kb-labs/rest-api", "2.0.0", ...) → "rest-api-2.0.0-f1d8a2e3"
func ComputeID(servicePkg, version string, adapters, plugins map[string]string) string {
	short := shortName(servicePkg)
	hash := hashInputs(servicePkg, version, adapters, plugins)
	return fmt.Sprintf("%s-%s-%s", short, version, hash)
}

// shortName returns the package name without the @scope/ prefix.
// "@kb-labs/gateway" → "gateway"; "gateway" → "gateway".
func shortName(pkg string) string {
	if strings.HasPrefix(pkg, "@") {
		if i := strings.Index(pkg, "/"); i > 0 {
			return pkg[i+1:]
		}
	}
	return pkg
}

// hashInputs produces an 8-char hex digest over a canonicalized representation
// of the inputs.
func hashInputs(servicePkg, version string, adapters, plugins map[string]string) string {
	return HashInputs(servicePkg, version, adapters, plugins)[:8]
}

// HashInputs returns the full 64-char SHA-256 hex digest over the canonical
// representation "svc@ver|k1=v1,k2=v2|p1=s1" (keys sorted). Used both as input
// to ComputeID (truncated to 8 chars) and as the integrity field of release.json.
func HashInputs(servicePkg, version string, adapters, plugins map[string]string) string {
	var sb strings.Builder
	sb.WriteString(servicePkg)
	sb.WriteString("@")
	sb.WriteString(version)
	sb.WriteString("|")
	sb.WriteString(joinSorted(adapters))
	sb.WriteString("|")
	sb.WriteString(joinSorted(plugins))

	sum := sha256.Sum256([]byte(sb.String()))
	return hex.EncodeToString(sum[:])
}

// joinSorted returns "k1=v1,k2=v2,..." with keys sorted lexicographically.
// Empty or nil maps return "".
func joinSorted(m map[string]string) string {
	if len(m) == 0 {
		return ""
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, len(keys))
	for i, k := range keys {
		parts[i] = k + "=" + m[k]
	}
	return strings.Join(parts, ",")
}
