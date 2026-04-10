package detect

import (
	"os"
	"path/filepath"
)

// pmSignal maps a file to the package manager it indicates.
// Lockfiles first (strongest signal), then manifest files (weaker).
type pmSignal struct {
	file string
	pm   PkgManager
}

var pmSignals = []pmSignal{
	// Lockfiles — strongest signal, first match wins
	{"pnpm-lock.yaml", PMPnpm},
	{"bun.lockb", PMBun},
	{"bun.lock", PMBun},
	{"yarn.lock", PMYarn},
	{"package-lock.json", PMNpm},
	{"Cargo.lock", PMCargo},
	{"go.sum", PMGoMod},
	{"uv.lock", PMUV},
	{"poetry.lock", PMPoetry},

	// Manifest files — weaker, used as fallback
	{"Cargo.toml", PMCargo},
	{"go.mod", PMGoMod},
	{"requirements.txt", PMPip},
	{"setup.py", PMPip},
	{"pyproject.toml", PMPip},
	{"pom.xml", PMMaven},
	{"build.gradle", PMGradle},
	{"build.gradle.kts", PMGradle},
}

// detectPkgManager checks dir for lockfiles and manifests, returning the
// first match. Returns empty string if nothing is detected.
func detectPkgManager(dir string) PkgManager {
	for _, sig := range pmSignals {
		if _, err := os.Stat(filepath.Join(dir, sig.file)); err == nil {
			return sig.pm
		}
	}
	return ""
}
