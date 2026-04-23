package secrets

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

// EnvBackend resolves names from the process environment, falling back to
// values loaded from .env and .env.local at a given root. This is the default
// backend used both in local dev (admin's laptop) and in CI (secrets injected
// into env).
type EnvBackend struct {
	// Overlay values (usually loaded from .env files at deploy-repo root).
	// Used only when the process environment does not have the key.
	Overlay map[string]string
}

// Lookup returns the value for name, searching: process env → overlay.
func (b *EnvBackend) Lookup(name string) (string, bool) {
	if v, ok := os.LookupEnv(name); ok {
		return v, true
	}
	if b != nil {
		if v, ok := b.Overlay[name]; ok {
			return v, true
		}
	}
	return "", false
}

// LoadDotEnv reads a simple KEY=VALUE file. Lines starting with '#' and blank
// lines are ignored. Single- or double-quoted values are unwrapped. Missing
// file returns an empty map without error.
func LoadDotEnv(path string) map[string]string {
	out := map[string]string{}
	f, err := os.Open(path) //nolint:gosec // caller-controlled path
	if err != nil {
		return out
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		eq := strings.IndexByte(line, '=')
		if eq < 1 {
			continue
		}
		k := strings.TrimSpace(line[:eq])
		v := strings.TrimSpace(line[eq+1:])
		if len(v) >= 2 {
			first, last := v[0], v[len(v)-1]
			if (first == '"' && last == '"') || (first == '\'' && last == '\'') {
				v = v[1 : len(v)-1]
			}
		}
		out[k] = v
	}
	return out
}

// BackendFromRoot builds an EnvBackend seeded with .env and .env.local from
// the given directory (typically the deploy-repo root).
func BackendFromRoot(root string) *EnvBackend {
	overlay := map[string]string{}
	for _, name := range []string{".env", ".env.local"} {
		for k, v := range LoadDotEnv(filepath.Join(root, name)) {
			overlay[k] = v
		}
	}
	return &EnvBackend{Overlay: overlay}
}
