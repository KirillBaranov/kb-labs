package config

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

const configName = "deploy.yaml"
const configDir = ".kb"

// Discover walks up from dir looking for .kb/deploy.yaml.
// Returns the absolute path or an error if not found.
func Discover(dir string) (string, error) {
	current := dir
	for {
		candidate := filepath.Join(current, configDir, configName)
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
		current = parent
	}
	return "", fmt.Errorf("deploy config not found: searched up from %s looking for %s/%s", dir, configDir, configName)
}

// RepoRoot returns the repository root given the path to the config file.
// If the config is inside .kb/, steps up one level.
func RepoRoot(cfgPath string) string {
	dir := filepath.Dir(cfgPath)
	if filepath.Base(dir) == configDir {
		return filepath.Dir(dir)
	}
	return dir
}

// Load reads the config at path, expands ${VAR} references using the environment
// (with .env at repoRoot loaded first), and resolves dockerfile/context paths
// relative to repoRoot.
func Load(path, repoRoot string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}

	// Build env map: .env values are overridden by real env.
	env := loadDotEnv(filepath.Join(repoRoot, ".env"))
	for _, kv := range os.Environ() {
		parts := strings.SplitN(kv, "=", 2)
		if len(parts) == 2 {
			env[parts[0]] = parts[1]
		}
	}

	expanded := os.Expand(string(data), func(key string) string {
		return env[key]
	})

	var cfg Config
	if err := yaml.Unmarshal([]byte(expanded), &cfg); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}

	// Resolve dockerfile and context relative to repoRoot.
	for name, t := range cfg.Targets {
		if t.Dockerfile != "" && !filepath.IsAbs(t.Dockerfile) {
			t.Dockerfile = filepath.Join(repoRoot, t.Dockerfile)
		}
		if t.Context != "" && !filepath.IsAbs(t.Context) {
			t.Context = filepath.Join(repoRoot, t.Context)
		}
		cfg.Targets[name] = t
	}

	return &cfg, nil
}

// loadDotEnv reads a simple KEY=VALUE file. Lines starting with # are ignored.
// Returns an empty map if the file doesn't exist.
func loadDotEnv(path string) map[string]string {
	env := make(map[string]string)
	f, err := os.Open(path)
	if err != nil {
		return env
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		// Strip optional surrounding quotes.
		if len(val) >= 2 && ((val[0] == '"' && val[len(val)-1] == '"') || (val[0] == '\'' && val[len(val)-1] == '\'')) {
			val = val[1 : len(val)-1]
		}
		env[key] = val
	}
	return env
}
