// Package releaseid computes the deterministic release-id used to name a
// service's release directory (ADR-0014 §D3).
//
// Identity model: a release is identified by its service spec (package, version,
// adapters, plugins) AND the resolved package content (registry integrity). The
// content digest is what makes a same-version content patch produce a NEW id, so
// the planner sees an install instead of a skip. When integrity is empty the id
// reduces to the spec-only form that kb-create/internal/releases.ComputeID
// produces — kb-deploy stays the authoritative computer and passes the resulting
// id to install-service via --release-id, so the two never have to agree on the
// content-aware variant.
package releaseid

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
)

// ComputeID returns "<service-short>-<version>-<hash8>". integrity is the
// registry-reported content digest of the service package (e.g. an npm
// "sha512-..." string); pass "" for the spec-only (kb-create-compatible) id.
func ComputeID(servicePkg, version, integrity string, adapters, plugins map[string]string) string {
	short := shortName(servicePkg)
	hash := hashInputs(servicePkg, version, integrity, adapters, plugins)[:8]
	return fmt.Sprintf("%s-%s-%s", short, version, hash)
}

func shortName(pkg string) string {
	if strings.HasPrefix(pkg, "@") {
		if i := strings.Index(pkg, "/"); i > 0 {
			return pkg[i+1:]
		}
	}
	return pkg
}

func hashInputs(servicePkg, version, integrity string, adapters, plugins map[string]string) string {
	var sb strings.Builder
	sb.WriteString(servicePkg)
	sb.WriteString("@")
	sb.WriteString(version)
	sb.WriteString("|")
	sb.WriteString(joinSorted(adapters))
	sb.WriteString("|")
	sb.WriteString(joinSorted(plugins))
	// Empty integrity keeps the canonical spec-only digest (kb-create parity).
	// A non-empty integrity is appended so a content change at the same version
	// changes the id.
	if integrity != "" {
		sb.WriteString("|")
		sb.WriteString(integrity)
	}

	sum := sha256.Sum256([]byte(sb.String()))
	return hex.EncodeToString(sum[:])
}

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
