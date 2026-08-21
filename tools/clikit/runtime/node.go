// Package runtime defines the runtime contract shared by KB Labs launchers.
package runtime

import "github.com/kb-labs/clikit/toolchain"

// SupportedNodeMajor is the only Node.js major supported by the KB Labs
// platform. Keep this aligned with the root package.json engines field and
// the E2E base image.
const SupportedNodeMajor = toolchain.SupportedNodeMajor

// NodeVersion reads the version from a specific Node binary. Callers should
// pass the same resolved binary that will launch platform services rather than
// relying on a potentially different `node` later in PATH.
func NodeVersion(nodePath string) (string, error) {
	return toolchain.Version(nodePath)
}

// ValidateNodeVersion rejects every Node.js major except the platform's
// supported major. A hard boundary here prevents late, opaque failures from
// dependencies that rely on Node 24 built-ins such as node:sqlite.
func ValidateNodeVersion(version string) error {
	return toolchain.ValidateNode(version)
}

// CheckNode validates the exact Node binary a launcher selected.
func CheckNode(nodePath string) (string, error) {
	version, err := NodeVersion(nodePath)
	if err != nil {
		return "", err
	}
	return version, ValidateNodeVersion(version)
}
