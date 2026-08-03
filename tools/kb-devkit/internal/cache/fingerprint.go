package cache

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

// FormatVersion is part of every task fingerprint. Bump it only when the
// on-disk manifest/object format changes incompatibly; old entries remain
// harmless but cannot be selected by a newer devkit.
const FormatVersion = "kb-devkit-cas-v1"

// RuntimeFingerprint describes the tools that can affect generated output.
// A missing executable is represented explicitly, so this function remains
// deterministic for commands that do not require Node or Go.
func RuntimeFingerprint() string {
	parts := []string{FormatVersion, runtime.Version()}
	for _, command := range [][]string{{"node", "--version"}, {"pnpm", "--version"}, {"go", "version"}} {
		output, err := exec.Command(command[0], command[1:]...).Output()
		if err != nil {
			parts = append(parts, command[0]+":missing")
			continue
		}
		parts = append(parts, command[0]+":"+strings.TrimSpace(string(output)))
	}

	// The executable hash invalidates entries when the devkit implementation
	// changes even if devkit.yaml stays identical.
	if executable, err := os.Executable(); err == nil {
		if bytes, err := os.ReadFile(executable); err == nil {
			digest := sha256.Sum256(bytes)
			parts = append(parts, "devkit:"+hex.EncodeToString(digest[:]))
		}
	}

	digest := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(digest[:])
}
