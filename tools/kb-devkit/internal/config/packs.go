package config

import (
	"embed"
	"fmt"
	"path/filepath"
	"strings"
)

//go:embed packs/*.yaml
var builtInPackFS embed.FS

func loadBuiltInPack(name string) (*DevkitConfig, error) {
	path := filepath.ToSlash(filepath.Join("packs", name+".yaml"))
	data, err := builtInPackFS.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("unknown built-in pack %q", name)
	}
	return parseYAMLBytes(data)
}

func loadPackagePack(root, ref string) (*DevkitConfig, error) {
	pkgRef := strings.TrimPrefix(ref, "package:")
	pkgName := pkgRef
	relPath := "devkit.pack.yaml"
	if i := strings.Index(pkgRef, "#"); i >= 0 {
		pkgName = pkgRef[:i]
		relPath = pkgRef[i+1:]
	}
	path := filepath.Join(root, "node_modules", pkgName, relPath)
	return LoadFile(path)
}

func GetDefaultPreset(name string) (Preset, bool) {
	cfg, err := loadBuiltInPack("generic")
	if err != nil || cfg == nil || cfg.Presets == nil {
		return Preset{}, false
	}
	p, ok := cfg.Presets[name]
	return p, ok
}
