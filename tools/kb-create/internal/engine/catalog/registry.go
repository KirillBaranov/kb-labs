package catalog

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const (
	maxRegistryFileBytes  = 64 << 20
	maxRegistryTotalBytes = 256 << 20
	maxRegistryEntries    = 100_000
)

type RegistryOptions struct {
	NPM      string
	Registry string
	Cache    ManifestCache
}

// ResolveRegistryPackage downloads only the package artifact and reads its
// declared kb.manifest. It never installs dependencies or executes package
// lifecycle scripts; npm pack is used with an isolated destination.
func ResolveRegistryPackage(ctx context.Context, packageSpec string, options RegistryOptions) (ResolvedEntity, error) {
	if strings.TrimSpace(packageSpec) == "" {
		return ResolvedEntity{}, fmt.Errorf("package spec is empty")
	}
	npm := options.NPM
	if npm == "" {
		npm = "npm"
	}
	tempDir, err := os.MkdirTemp("", "kb-create-manifest-")
	if err != nil {
		return ResolvedEntity{}, err
	}
	defer os.RemoveAll(tempDir)
	command := exec.CommandContext(ctx, npm, "pack", packageSpec, "--ignore-scripts", "--json", "--pack-destination", tempDir) // #nosec G204 -- explicit package spec and npm executable.
	// Keep catalog resolution on the same registry as installation. In CI the
	// e2e suite publishes the freshly built workspace to Verdaccio and exposes
	// it through KB_REGISTRY_URL; without forwarding that setting, npm pack
	// silently resolves the package from public npm instead and returns a stale
	// release whose manifest points at versions absent from Verdaccio.
	registry := options.Registry
	if registry == "" {
		registry = os.Getenv("NPM_CONFIG_REGISTRY")
	}
	if registry == "" {
		registry = os.Getenv("KB_REGISTRY_URL")
	}
	if registry != "" {
		command.Env = append(os.Environ(), "NPM_CONFIG_REGISTRY="+registry)
	}
	output, err := command.Output()
	if err != nil {
		return ResolvedEntity{}, fmt.Errorf("download package manifest %q: %w", packageSpec, err)
	}
	var packed []struct {
		Filename string `json:"filename"`
	}
	if err := json.Unmarshal(output, &packed); err != nil || len(packed) == 0 || packed[0].Filename == "" {
		return ResolvedEntity{}, fmt.Errorf("npm pack returned no artifact for %q", packageSpec)
	}
	archivePath := filepath.Join(tempDir, filepath.Base(packed[0].Filename))
	extractedRoot := filepath.Join(tempDir, "extracted")
	if err := extractTarGz(archivePath, extractedRoot); err != nil {
		return ResolvedEntity{}, err
	}
	// npm pack archives conventionally contain a single top-level `package/`
	// directory. Keep extraction generic, but require that package root before
	// evaluating package.json so malformed archives fail clearly.
	extracted := filepath.Join(extractedRoot, "package")
	if _, err := os.Stat(filepath.Join(extracted, "package.json")); err != nil {
		return ResolvedEntity{}, fmt.Errorf("package archive has no package/package.json: %w", err)
	}
	resolved, err := ResolvePackage(ctx, extracted, ResolveOptions{Node: "node"})
	if err != nil {
		return ResolvedEntity{}, err
	}
	if options.Cache.Dir != "" {
		if err := options.Cache.Save(resolved); err != nil {
			return ResolvedEntity{}, err
		}
	}
	return resolved, nil
}

func extractTarGz(archivePath, destination string) error {
	file, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer file.Close()
	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		return fmt.Errorf("open package archive: %w", err)
	}
	defer gzipReader.Close()
	tarReader := tar.NewReader(gzipReader)
	root, err := filepath.Abs(destination)
	if err != nil {
		return err
	}
	var entries, totalBytes int64
	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		entries++
		if entries > maxRegistryEntries {
			return fmt.Errorf("package archive contains too many entries (max %d)", maxRegistryEntries)
		}
		name := filepath.Clean(filepath.FromSlash(header.Name))
		if name == "." || filepath.IsAbs(name) || name == ".." || strings.HasPrefix(name, ".."+string(filepath.Separator)) {
			return fmt.Errorf("package archive path escapes root: %q", header.Name)
		}
		target := filepath.Join(root, name)
		if header.Typeflag == tar.TypeSymlink || header.Typeflag == tar.TypeLink {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o750); err != nil {
			return err
		}
		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o750); err != nil {
				return err
			}
		case tar.TypeReg:
			if header.Size > maxRegistryFileBytes || totalBytes > maxRegistryTotalBytes-header.Size {
				return fmt.Errorf("package archive exceeds extraction size limit")
			}
			output, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
			if err != nil {
				return err
			}
			written, err := io.Copy(output, io.LimitReader(tarReader, header.Size))
			if err != nil {
				_ = output.Close()
				return err
			}
			if written != header.Size {
				_ = output.Close()
				return fmt.Errorf("package archive entry %q ended before declared size", header.Name)
			}
			totalBytes += written
			if err := output.Close(); err != nil {
				return err
			}
		}
	}
	return nil
}
