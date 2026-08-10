package catalog

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"

	engineconfig "github.com/kb-labs/create/internal/engine/config"
	"github.com/kb-labs/create/internal/engine/migrate"
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
	source.Effects = append([]Effect(nil), source.Effects...)
	source.Migrations = append([]migrate.Definition(nil), source.Migrations...)
	for i := range source.Components {
		source.Components[i].Requires = append([]Requirement(nil), source.Components[i].Requires...)
		source.Components[i].CompanionPackages = append([]string(nil), source.Components[i].CompanionPackages...)
		source.Components[i].DependsOn = append([]string(nil), source.Components[i].DependsOn...)
		sort.Strings(source.Components[i].CompanionPackages)
		sort.Strings(source.Components[i].DependsOn)
		sort.Slice(source.Components[i].Requires, func(a, b int) bool {
			return source.Components[i].Requires[a].Capability < source.Components[i].Requires[b].Capability
		})
	}
	for i := range source.Providers {
		source.Providers[i].Features = append([]string(nil), source.Providers[i].Features...)
		sort.Strings(source.Providers[i].Features)
	}
	for i := range source.Effects {
		source.Effects[i].Config = append([]engineconfig.ConfigPatch(nil), source.Effects[i].Config...)
		sort.Slice(source.Effects[i].Config, func(a, b int) bool {
			return source.Effects[i].Config[a].ID < source.Effects[i].Config[b].ID
		})
	}
	sort.Slice(source.Components, func(i, j int) bool { return source.Components[i].ID < source.Components[j].ID })
	sort.Slice(source.Providers, func(i, j int) bool { return source.Providers[i].ID < source.Providers[j].ID })
	sort.Slice(source.Effects, func(i, j int) bool { return source.Effects[i].ID < source.Effects[j].ID })
	source.Digest = ""
	return source
}

func Digest(source Catalog) string {
	normalized := Normalize(source)
	data, _ := json.Marshal(normalized)
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}
