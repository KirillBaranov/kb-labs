// Package environ resolves and caches paths to runtime binaries (node, pnpm, docker).
package environ

import (
	"encoding/json"
	"fmt"
	"os"
	"time"
)

const cacheMaxAge = 24 * time.Hour

// EnvCache holds resolved paths to binaries and extra PATH entries.
type EnvCache struct {
	ResolvedAt time.Time `json:"resolvedAt"`
	Node       string    `json:"node,omitempty"`
	Pnpm       string    `json:"pnpm,omitempty"`
	Docker     string    `json:"docker,omitempty"`
	Shell      string    `json:"shell"`
	ExtraPath  []string  `json:"extraPath,omitempty"`
}

// LoadCache reads a cached environment from the given path.
// Returns nil (no error) if the file doesn't exist.
func LoadCache(path string) (*EnvCache, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read env cache: %w", err)
	}

	var cache EnvCache
	if err := json.Unmarshal(data, &cache); err != nil {
		return nil, fmt.Errorf("parse env cache: %w", err)
	}

	return &cache, nil
}

// Save writes the cache to the given path.
func (c *EnvCache) Save(path string) error {
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal env cache: %w", err)
	}
	return os.WriteFile(path, data, 0o600)
}

// IsStale returns true if the cache is older than 24h or any binary no longer exists.
func (c *EnvCache) IsStale() bool {
	if time.Since(c.ResolvedAt) > cacheMaxAge {
		return true
	}
	// Check that resolved binaries still exist.
	for _, path := range []string{c.Node, c.Pnpm, c.Docker} {
		if path == "" {
			continue
		}
		if _, err := os.Stat(path); err != nil {
			return true
		}
	}
	return false
}

// BuildPath constructs a PATH string from ExtraPath entries plus the current PATH.
func (c *EnvCache) BuildPath() string {
	var parts []string
	parts = append(parts, c.ExtraPath...)

	if current := os.Getenv("PATH"); current != "" {
		parts = append(parts, current)
	}

	result := ""
	for i, p := range parts {
		if i > 0 {
			result += ":"
		}
		result += p
	}
	return result
}
