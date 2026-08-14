package release

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/kb-labs/create/v2/catalog"
)

// BindRegistryTarballs proves that npm serves the same candidate bytes that
// stage hashed, then writes their immutable URLs into the public index. It is
// intentionally post-publish: a pre-publish tarball filename is local CI
// evidence, not an installer URL.
func BindRegistryTarballs(source catalog.Catalog, stageManifest, registry string, client *http.Client) (catalog.Catalog, error) {
	data, err := os.ReadFile(stageManifest)
	if err != nil {
		return catalog.Catalog{}, fmt.Errorf("read staged artifact manifest: %w", err)
	}
	var staged []StagedArtifact
	if err := json.Unmarshal(data, &staged); err != nil {
		return catalog.Catalog{}, fmt.Errorf("decode staged artifact manifest: %w", err)
	}
	byPackage := map[string]StagedArtifact{}
	for _, item := range staged {
		byPackage[item.Name] = item
	}
	if client == nil {
		client = http.DefaultClient
	}
	registry = strings.TrimRight(registry, "/")
	bind := func(component *catalog.Component) error {
		staged, ok := byPackage[component.Package]
		if !ok || staged.Version != component.Version || !strings.EqualFold(staged.SHA256, component.SHA256) {
			return fmt.Errorf("index artifact %s@%s is not the exact staged candidate", component.Package, component.Version)
		}
		metadataURL := registry + "/" + url.PathEscape(component.Package) + "/" + url.PathEscape(component.Version)
		response, getErr := client.Get(metadataURL)
		if getErr != nil {
			return fmt.Errorf("read registry metadata for %s@%s: %w", component.Package, component.Version, getErr)
		}
		metadata, readErr := io.ReadAll(response.Body)
		_ = response.Body.Close()
		if readErr != nil || response.StatusCode < 200 || response.StatusCode >= 300 {
			return fmt.Errorf("read registry metadata for %s@%s: status %d: %v", component.Package, component.Version, response.StatusCode, readErr)
		}
		var result struct {
			Dist struct {
				Tarball string `json:"tarball"`
			} `json:"dist"`
		}
		if err := json.Unmarshal(metadata, &result); err != nil || result.Dist.Tarball == "" {
			return fmt.Errorf("registry metadata for %s@%s lacks dist.tarball", component.Package, component.Version)
		}
		artifact, getErr := client.Get(result.Dist.Tarball)
		if getErr != nil {
			return fmt.Errorf("download published tarball for %s@%s: %w", component.Package, component.Version, getErr)
		}
		bytes, readErr := io.ReadAll(artifact.Body)
		_ = artifact.Body.Close()
		if readErr != nil || artifact.StatusCode < 200 || artifact.StatusCode >= 300 {
			return fmt.Errorf("download published tarball for %s@%s: status %d: %v", component.Package, component.Version, artifact.StatusCode, readErr)
		}
		actual := sha256.Sum256(bytes)
		if !strings.EqualFold(hex.EncodeToString(actual[:]), staged.SHA256) {
			return fmt.Errorf("published tarball for %s@%s does not match staged sha256", component.Package, component.Version)
		}
		component.Tarball = result.Dist.Tarball
		return nil
	}
	for i := range source.Platforms {
		platform := &source.Platforms[i]
		component := catalog.Component{Package: platform.Package, Version: platform.Version, SHA256: platform.SHA256}
		if err := bind(&component); err != nil {
			return catalog.Catalog{}, err
		}
		platform.Tarball = component.Tarball
		for j := range platform.Members {
			if err := bind(&platform.Members[j]); err != nil {
				return catalog.Catalog{}, err
			}
		}
	}
	for i := range source.SDKs {
		if err := bind(&source.SDKs[i]); err != nil {
			return catalog.Catalog{}, err
		}
	}
	for i := range source.Plugins {
		if err := bind(&source.Plugins[i]); err != nil {
			return catalog.Catalog{}, err
		}
	}
	for i := range source.Adapters {
		if err := bind(&source.Adapters[i].Component); err != nil {
			return catalog.Catalog{}, err
		}
	}
	source.Schema, source.Digest = "", ""
	return catalog.Seal(source)
}
