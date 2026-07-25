package catalog

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
)

func Load(data []byte) (Catalog, error) {
	var source Catalog
	if err := json.Unmarshal(data, &source); err != nil {
		return Catalog{}, fmt.Errorf("decode catalog: %w", err)
	}
	suppliedDigest := source.Digest
	source = Normalize(source)
	if err := source.Validate(); err != nil {
		return Catalog{}, fmt.Errorf("catalog: %w", err)
	}
	computed := Digest(source)
	if suppliedDigest != "" && suppliedDigest != computed {
		return Catalog{}, fmt.Errorf("catalog digest mismatch: got %q, computed %q", suppliedDigest, computed)
	}
	source.Digest = computed
	return source, nil
}

func Normalize(source Catalog) Catalog {
	source.Components = append([]Component(nil), source.Components...)
	source.Providers = append([]Provider(nil), source.Providers...)
	for i := range source.Components {
		source.Components[i].Requires = append([]Requirement(nil), source.Components[i].Requires...)
		source.Components[i].DependsOn = append([]string(nil), source.Components[i].DependsOn...)
		sort.Strings(source.Components[i].DependsOn)
		sort.Slice(source.Components[i].Requires, func(a, b int) bool {
			return source.Components[i].Requires[a].Capability < source.Components[i].Requires[b].Capability
		})
	}
	for i := range source.Providers {
		source.Providers[i].Features = append([]string(nil), source.Providers[i].Features...)
		sort.Strings(source.Providers[i].Features)
	}
	sort.Slice(source.Components, func(i, j int) bool { return source.Components[i].ID < source.Components[j].ID })
	sort.Slice(source.Providers, func(i, j int) bool { return source.Providers[i].ID < source.Providers[j].ID })
	source.Digest = ""
	return source
}

func Digest(source Catalog) string {
	normalized := Normalize(source)
	data, _ := json.Marshal(normalized)
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}
