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
	// Inject .env values into the process environment so key_env lookups work.
	for k, v := range env {
		if os.Getenv(k) == "" {
			_ = os.Setenv(k, v)
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

// loadDotEnv reads a simple KEY=VALUE file, supporting multiline quoted values.
// Lines starting with # are ignored. Returns an empty map if the file doesn't exist.
func loadDotEnv(path string) map[string]string {
	env := make(map[string]string)
	f, err := os.Open(path)
	if err != nil {
		return env
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 64*1024), 64*1024)

	var (
		pendingKey   string
		pendingVal   strings.Builder
		pendingQuote byte
	)

	for scanner.Scan() {
		line := scanner.Text()

		// Inside a multiline quoted value — look for closing quote.
		if pendingKey != "" {
			if len(line) > 0 && line[len(line)-1] == pendingQuote {
				pendingVal.WriteString(line[:len(line)-1])
				env[pendingKey] = pendingVal.String()
				pendingKey = ""
				pendingVal.Reset()
			} else {
				pendingVal.WriteString(line)
				pendingVal.WriteByte('\n')
			}
			continue
		}

		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		parts := strings.SplitN(trimmed, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := parts[1]

		// Single-line quoted value.
		if len(val) >= 2 && val[0] == '"' && val[len(val)-1] == '"' {
			env[key] = val[1 : len(val)-1]
			continue
		}
		if len(val) >= 2 && val[0] == '\'' && val[len(val)-1] == '\'' {
			env[key] = val[1 : len(val)-1]
			continue
		}

		// Start of a multiline quoted value.
		if len(val) > 0 && (val[0] == '"' || val[0] == '\'') {
			pendingKey = key
			pendingQuote = val[0]
			pendingVal.WriteString(val[1:])
			pendingVal.WriteByte('\n')
			continue
		}

		env[key] = strings.TrimSpace(val)
	}
	return env
}
