package doctor

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ApplyDefaults writes only manifest-declared safe defaults into V2's
// generated config. JSON Pointer paths prevent component authors from
// smuggling an ad-hoc mutation language into doctor.
func ApplyDefaults(platformRoot string, plan RepairPlan) error {
	path := filepath.Join(platformRoot, ".kb", "kb.config.jsonc")
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read generated config: %w", err)
	}
	config := map[string]any{}
	if err := json.Unmarshal(data, &config); err != nil {
		return fmt.Errorf("decode generated config: %w", err)
	}
	if err := ApplySafe(plan, func(finding Finding) error {
		return setPointer(config, finding.Path, finding.Default)
	}); err != nil {
		return err
	}
	encoded, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("encode repaired config: %w", err)
	}
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, append(encoded, '\n'), 0o600); err != nil {
		return err
	}
	return os.Rename(temporary, path)
}

func setPointer(config map[string]any, pointer string, raw json.RawMessage) error {
	if !strings.HasPrefix(pointer, "/") || pointer == "/" {
		return fmt.Errorf("safe default path %q is not a JSON pointer", pointer)
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return fmt.Errorf("decode safe default for %s: %w", pointer, err)
	}
	parts := strings.Split(strings.TrimPrefix(pointer, "/"), "/")
	current := config
	for _, encoded := range parts[:len(parts)-1] {
		key := strings.ReplaceAll(strings.ReplaceAll(encoded, "~1", "/"), "~0", "~")
		next, exists := current[key]
		if !exists {
			child := map[string]any{}
			current[key] = child
			current = child
			continue
		}
		child, ok := next.(map[string]any)
		if !ok {
			return fmt.Errorf("safe default path %q crosses non-object key %q", pointer, key)
		}
		current = child
	}
	key := strings.ReplaceAll(strings.ReplaceAll(parts[len(parts)-1], "~1", "/"), "~0", "~")
	current[key] = value
	return nil
}
