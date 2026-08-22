package catalog

import (
	"encoding/json"
	"fmt"
	"os"
)

// LoadFile reads the immutable release index selected before any artifact
// install. It is deliberately a file input: registry discovery belongs to the
// release publisher, while CI/agents need a reviewable exact index.
func LoadFile(path string) (Catalog, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Catalog{}, fmt.Errorf("read release index: %w", err)
	}
	var result Catalog
	if err := json.Unmarshal(data, &result); err != nil {
		return Catalog{}, fmt.Errorf("decode release index: %w", err)
	}
	if err := Verify(result); err != nil {
		return Catalog{}, fmt.Errorf("validate release index: %w", err)
	}
	if result.Compatibility == nil {
		return Catalog{}, fmt.Errorf("validate release index: compatibility matrix is required")
	}
	return result, nil
}
