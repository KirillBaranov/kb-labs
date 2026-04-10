package environ

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Resolve discovers runtime binary paths and builds an EnvCache.
func Resolve() *EnvCache {
	cache := &EnvCache{
		ResolvedAt: time.Now(),
		Shell:      os.Getenv("SHELL"),
	}
	if cache.Shell == "" {
		cache.Shell = "/bin/sh"
	}

	var extraDirs []string

	// Resolve node — check NVM first, then PATH.
	if nvmDir := os.Getenv("NVM_DIR"); nvmDir != "" {
		nodePath := resolveNVMNode(nvmDir)
		if nodePath != "" {
			cache.Node = nodePath
			extraDirs = append(extraDirs, filepath.Dir(nodePath))
		}
	}
	if cache.Node == "" {
		cache.Node = which("node")
		if cache.Node != "" {
			extraDirs = append(extraDirs, filepath.Dir(cache.Node))
		}
	}

	// Resolve pnpm.
	cache.Pnpm = which("pnpm")
	if cache.Pnpm != "" {
		dir := filepath.Dir(cache.Pnpm)
		if !contains(extraDirs, dir) {
			extraDirs = append(extraDirs, dir)
		}
	}

	// Resolve docker.
	cache.Docker = which("docker")

	// Add homebrew dirs on macOS.
	for _, prefix := range []string{"/opt/homebrew/bin", "/usr/local/bin"} {
		if fi, err := os.Stat(prefix); err == nil && fi.IsDir() {
			if !contains(extraDirs, prefix) {
				extraDirs = append(extraDirs, prefix)
			}
		}
	}

	cache.ExtraPath = extraDirs
	return cache
}

// resolveNVMNode finds the node binary from NVM's default alias.
func resolveNVMNode(nvmDir string) string {
	// Read default alias.
	aliasPath := filepath.Join(nvmDir, "alias", "default")
	data, err := os.ReadFile(aliasPath)
	if err != nil {
		return ""
	}
	alias := strings.TrimSpace(string(data))
	if alias == "" {
		return ""
	}

	// Try direct version match.
	versionsDir := filepath.Join(nvmDir, "versions", "node")
	entries, err := os.ReadDir(versionsDir)
	if err != nil {
		return ""
	}

	for _, e := range entries {
		name := e.Name()
		if name == alias || strings.HasPrefix(name, alias+".") || strings.HasPrefix(name, "v"+alias) {
			nodePath := filepath.Join(versionsDir, name, "bin", "node")
			if _, err := os.Stat(nodePath); err == nil {
				return nodePath
			}
		}
	}

	// Try with "v" prefix.
	if !strings.HasPrefix(alias, "v") {
		for _, e := range entries {
			if strings.HasPrefix(e.Name(), "v"+alias) {
				nodePath := filepath.Join(versionsDir, e.Name(), "bin", "node")
				if _, err := os.Stat(nodePath); err == nil {
					return nodePath
				}
			}
		}
	}

	return ""
}

func which(name string) string {
	path, err := exec.LookPath(name)
	if err != nil {
		return ""
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return path
	}
	return abs
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}
