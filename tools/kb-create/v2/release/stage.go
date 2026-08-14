package release

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/kb-labs/create/v2/installed"
)

// StagedArtifact is the immutable output of `kb release stage`. The publisher
// records the tarball byte hash before anything is delivered to npm.
type StagedArtifact struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Tarball string `json:"tarball"`
	SHA256  string `json:"sha256"`
}

// MaterializeManifests extracts only the V2 launcher manifest from each exact
// staged tarball. It never consults a workspace checkout, so the release index
// describes the bytes that were actually published rather than a later build.
func MaterializeManifests(stageManifest, outputRoot string, requiredPackages ...string) ([]StagedArtifact, error) {
	data, err := os.ReadFile(stageManifest)
	if err != nil {
		return nil, fmt.Errorf("read staged artifact manifest: %w", err)
	}
	var artifacts []StagedArtifact
	if err := json.Unmarshal(data, &artifacts); err != nil {
		return nil, fmt.Errorf("decode staged artifact manifest: %w", err)
	}
	if len(artifacts) == 0 {
		return nil, fmt.Errorf("staged artifact manifest is empty")
	}
	if len(requiredPackages) > 0 {
		required := make(map[string]bool, len(requiredPackages))
		for _, pkg := range requiredPackages {
			if pkg == "" {
				return nil, fmt.Errorf("required launcher package is empty")
			}
			required[pkg] = true
		}
		selected := make([]StagedArtifact, 0, len(required))
		for _, artifact := range artifacts {
			if required[artifact.Name] {
				selected = append(selected, artifact)
				delete(required, artifact.Name)
			}
		}
		if len(required) > 0 {
			missing := make([]string, 0, len(required))
			for pkg := range required {
				missing = append(missing, pkg)
			}
			sort.Strings(missing)
			return nil, fmt.Errorf("launcher topology packages were not staged: %s", strings.Join(missing, ", "))
		}
		artifacts = selected
	}
	seen := make(map[string]struct{}, len(artifacts))
	stageDir := filepath.Dir(stageManifest)
	for _, artifact := range artifacts {
		if artifact.Name == "" || artifact.Version == "" || artifact.Tarball == "" || artifact.SHA256 == "" {
			return nil, fmt.Errorf("staged artifact must declare name, version, tarball and sha256")
		}
		key := artifact.Name + "@" + artifact.Version
		if _, exists := seen[key]; exists {
			return nil, fmt.Errorf("duplicate staged artifact %s", key)
		}
		seen[key] = struct{}{}
		tarballPath := filepath.Join(stageDir, artifact.Tarball)
		if err := verifyTarball(tarballPath, artifact); err != nil {
			return nil, err
		}
		manifest, err := manifestFromTarball(tarballPath, artifact)
		if err != nil {
			return nil, err
		}
		destination := filepath.Join(PackagePath(outputRoot, artifact.Name), "kb-create.manifest.json")
		if err := os.MkdirAll(filepath.Dir(destination), 0o750); err != nil {
			return nil, fmt.Errorf("create staged manifest directory: %w", err)
		}
		encoded, err := json.MarshalIndent(manifest, "", "  ")
		if err != nil {
			return nil, fmt.Errorf("encode staged launcher manifest: %w", err)
		}
		if err := os.WriteFile(destination, append(encoded, '\n'), 0o600); err != nil {
			return nil, fmt.Errorf("write staged launcher manifest: %w", err)
		}
	}
	return artifacts, nil
}

func verifyTarball(path string, artifact StagedArtifact) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read staged tarball %s: %w", artifact.Tarball, err)
	}
	sum := sha256.Sum256(data)
	if !strings.EqualFold(hex.EncodeToString(sum[:]), artifact.SHA256) {
		return fmt.Errorf("staged tarball %s sha256 does not match stage manifest", artifact.Tarball)
	}
	return nil
}

func manifestFromTarball(path string, artifact StagedArtifact) (installed.Manifest, error) {
	file, err := os.Open(path)
	if err != nil {
		return installed.Manifest{}, fmt.Errorf("open staged tarball %s: %w", artifact.Tarball, err)
	}
	defer file.Close()
	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		return installed.Manifest{}, fmt.Errorf("open staged tarball gzip %s: %w", artifact.Tarball, err)
	}
	defer gzipReader.Close()
	reader := tar.NewReader(gzipReader)
	for {
		header, readErr := reader.Next()
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return installed.Manifest{}, fmt.Errorf("read staged tarball %s: %w", artifact.Tarball, readErr)
		}
		if header.Typeflag != tar.TypeReg || (header.Name != "package/kb-create.manifest.json" && header.Name != "package/dist/kb-create.manifest.json") {
			continue
		}
		data, readErr := io.ReadAll(reader)
		if readErr != nil {
			return installed.Manifest{}, fmt.Errorf("read launcher manifest from %s: %w", artifact.Tarball, readErr)
		}
		var manifest installed.Manifest
		if err := json.Unmarshal(data, &manifest); err != nil {
			return installed.Manifest{}, fmt.Errorf("decode launcher manifest from %s: %w", artifact.Tarball, err)
		}
		if manifest.Schema != installed.ManifestSchema || manifest.Package != artifact.Name || manifest.Version != artifact.Version || strings.TrimSpace(manifest.ID) == "" {
			return installed.Manifest{}, fmt.Errorf("launcher manifest in %s does not match staged artifact %s@%s", artifact.Tarball, artifact.Name, artifact.Version)
		}
		return manifest, nil
	}
	return installed.Manifest{}, fmt.Errorf("staged tarball %s does not ship %s", artifact.Tarball, installed.ManifestSchema)
}
