package catalog

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type ManifestCache struct{ Dir string }

type cachedManifest struct {
	Package  string         `json:"package"`
	Version  string         `json:"version"`
	Digest   string         `json:"digest"`
	Manifest EntityManifest `json:"manifest"`
}

func (c ManifestCache) path(packageName, version string) (string, error) {
	if c.Dir == "" || packageName == "" || version == "" {
		return "", fmt.Errorf("manifest cache requires directory, package, and version")
	}
	key := sha256.Sum256([]byte(packageName + "@" + version))
	return filepath.Join(c.Dir, hex.EncodeToString(key[:])+".json"), nil
}

func (c ManifestCache) Load(packageName, version string) (ResolvedEntity, bool, error) {
	path, err := c.path(packageName, version)
	if err != nil {
		return ResolvedEntity{}, false, err
	}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return ResolvedEntity{}, false, nil
	}
	if err != nil {
		return ResolvedEntity{}, false, err
	}
	var cached cachedManifest
	if err := json.Unmarshal(data, &cached); err != nil {
		return ResolvedEntity{}, false, fmt.Errorf("decode manifest cache: %w", err)
	}
	if cached.Package != packageName || cached.Version != version || cached.Digest == "" {
		return ResolvedEntity{}, false, fmt.Errorf("manifest cache identity mismatch")
	}
	return ResolvedEntity{Manifest: cached.Manifest, Digest: cached.Digest}, true, nil
}

func (c ManifestCache) Save(entity ResolvedEntity) error {
	path, err := c.path(entity.Manifest.Package, entity.Manifest.Version)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(c.Dir, 0o750); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cachedManifest{Package: entity.Manifest.Package, Version: entity.Manifest.Version, Digest: entity.Digest, Manifest: entity.Manifest}, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(c.Dir, ".manifest-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer func() { _ = os.Remove(tmpName) }()
	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err := tmp.Write(append(data, '\n')); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}

func ResolvePackageCached(ctx context.Context, packageDir string, options ResolveOptions, cache ManifestCache) (ResolvedEntity, error) {
	packageData, err := os.ReadFile(filepath.Join(packageDir, "package.json"))
	if err != nil {
		return ResolvedEntity{}, err
	}
	var metadata struct {
		Name    string `json:"name"`
		Version string `json:"version"`
	}
	if err := json.Unmarshal(packageData, &metadata); err != nil {
		return ResolvedEntity{}, err
	}
	if cached, ok, cacheErr := cache.Load(metadata.Name, metadata.Version); cacheErr != nil {
		return ResolvedEntity{}, cacheErr
	} else if ok {
		return cached, nil
	}
	resolved, err := ResolvePackage(ctx, packageDir, options)
	if err != nil {
		return ResolvedEntity{}, err
	}
	if err := cache.Save(resolved); err != nil {
		return ResolvedEntity{}, err
	}
	return resolved, nil
}

func (c ManifestCache) Validate() error {
	if strings.TrimSpace(c.Dir) == "" {
		return fmt.Errorf("manifest cache directory is empty")
	}
	return nil
}
