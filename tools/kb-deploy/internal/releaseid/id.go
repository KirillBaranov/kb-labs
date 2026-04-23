// Package releaseid reproduces the deterministic release-id function from
// kb-create (ADR-0014 §D3). Kept in sync by duplication because kb-deploy and
// kb-create are separate Go modules.
//
// If this implementation and kb-create/internal/releases.ComputeID ever drift,
// apply will compute wrong desired ids and every Plan will look like "install"
// on already-correct hosts. Integration test in kb-deploy e2e/ asserts the
// digest matches the peer implementation.
package releaseid

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
)

// ComputeID returns "<service-short>-<version>-<hash8>".
func ComputeID(servicePkg, version string, adapters, plugins map[string]string) string {
	short := shortName(servicePkg)
	hash := hashInputs(servicePkg, version, adapters, plugins)[:8]
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

func hashInputs(servicePkg, version string, adapters, plugins map[string]string) string {
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
