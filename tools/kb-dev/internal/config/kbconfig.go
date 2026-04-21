package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var reComment = regexp.MustCompile(`(?m)//[^\n]*`)

// findPlatformDir walks upward from dir looking for .kb/kb.config.jsonc.
// If found and the file contains platform.dir, that directory is returned.
// Returns empty string if nothing is found or the field is absent.
func findPlatformDir(dir string) string {
	abs := dir
	for {
		candidate := filepath.Join(abs, ".kb", "kb.config.jsonc")
		if data, err := os.ReadFile(candidate); err == nil {
			if dir := extractPlatformDir(data); dir != "" {
				return dir
			}
		}
		parent := filepath.Dir(abs)
		if parent == abs {
			break
		}
		abs = parent
	}
	return ""
}

// extractPlatformDir strips comments from JSONC and reads platform.dir.
func extractPlatformDir(data []byte) string {
	stripped := reComment.ReplaceAllString(string(data), "")
	stripped = strings.TrimSpace(stripped)

	var v struct {
		Platform struct {
			Dir string `json:"dir"`
		} `json:"platform"`
	}
	if err := json.Unmarshal([]byte(stripped), &v); err != nil {
		return ""
	}
	return v.Platform.Dir
}
