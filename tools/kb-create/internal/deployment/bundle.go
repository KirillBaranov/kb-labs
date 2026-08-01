package deployment

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"

	"github.com/kb-labs/create/internal/pm"
)

// Export writes a portable production build context from a local installation.
func Export(platformRoot, service, output string, matrix Matrix) error {
	if service == "" {
		return fmt.Errorf("service is required")
	}
	if info, err := os.Stat(output); err == nil && !info.IsDir() {
		return fmt.Errorf("output %q is not a directory", output)
	}
	if err := os.MkdirAll(output, 0o750); err != nil {
		return err
	}
	versions, err := ReadVersions(platformRoot, matrix)
	if err != nil {
		return err
	}
	requirements, err := RequirementsFor(versions, matrix)
	if err != nil {
		return err
	}
	configName := "kb.config.jsonc"
	config, err := os.ReadFile(filepath.Join(platformRoot, ".kb", configName))
	if os.IsNotExist(err) {
		configName = "kb.config.json"
		config, err = os.ReadFile(filepath.Join(platformRoot, ".kb", configName))
	}
	if err != nil {
		return fmt.Errorf("read local composition config: %w", err)
	}
	lock, err := portableLock(filepath.Join(platformRoot, ".kb", "marketplace.lock"))
	if err != nil {
		return err
	}
	contract, err := json.MarshalIndent(Contract{Schema: ContractSchema, Service: service, Versions: versions, Requirements: requirements}, "", "  ")
	if err != nil {
		return err
	}
	matrixData, err := json.MarshalIndent(matrix, "", "  ")
	if err != nil {
		return err
	}
	files := map[string][]byte{
		configName:           config,
		"marketplace.lock":   lock,
		"deployment.json":    append(contract, '\n'),
		"compatibility.json": append(matrixData, '\n'),
	}
	provisioner, err := os.Executable()
	if err != nil {
		return fmt.Errorf("locate kb-create provisioner: %w", err)
	}
	if err := copyProvisioner(filepath.Join(output, "kb-create"), provisioner); err != nil {
		return fmt.Errorf("copy kb-create provisioner: %w", err)
	}
	if err := os.Chmod(filepath.Join(output, "kb-create"), 0o755); err != nil {
		return fmt.Errorf("make kb-create provisioner executable: %w", err)
	}
	files["Dockerfile"] = []byte(fmt.Sprintf("ARG KB_BASE_IMAGE\nFROM ${KB_BASE_IMAGE}\nCOPY --chown=1001:1001 kb-create /usr/local/bin/kb-create\nCOPY --chown=1001:1001 %s marketplace.lock deployment.json compatibility.json /app/.kb/\nRUN kb-create deployment provision --root /app --composition /app/.kb/deployment.json --lock /app/.kb/marketplace.lock --config /app/.kb/%s --matrix /app/.kb/compatibility.json\n", configName, configName))
	for name, data := range files {
		if err := os.WriteFile(filepath.Join(output, name), data, 0o644); err != nil {
			return err
		}
	}
	return nil
}

func copyProvisioner(destination, source string) error {
	input, err := os.Open(source) // #nosec G304 -- source is the running kb-create executable.
	if err != nil {
		return err
	}
	defer input.Close()
	outputFile, err := os.OpenFile(destination, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755) // #nosec G304 -- destination is inside the explicit export directory.
	if err != nil {
		return err
	}
	defer outputFile.Close()
	_, err = io.Copy(outputFile, input)
	return err
}

func portableLock(path string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read local marketplace lock: %w", err)
	}
	var lock struct {
		Schema    string                    `json:"schema"`
		Installed map[string]map[string]any `json:"installed"`
	}
	if err := json.Unmarshal(data, &lock); err != nil {
		return nil, fmt.Errorf("parse local marketplace lock: %w", err)
	}
	for _, entry := range lock.Installed {
		delete(entry, "resolvedPath")
		delete(entry, "installedAt")
	}
	return json.MarshalIndent(lock, "", "  ")
}

// Provision is intentionally a build-time operation. It installs only lock
// entries and rewrites their paths for the target image filesystem.
func Provision(root, lockPath string) error {
	data, err := os.ReadFile(lockPath)
	if err != nil {
		return err
	}
	var lock struct {
		Schema    string                    `json:"schema"`
		Installed map[string]map[string]any `json:"installed"`
	}
	if err := json.Unmarshal(data, &lock); err != nil {
		return err
	}
	names := make([]string, 0, len(lock.Installed))
	for name := range lock.Installed {
		names = append(names, name)
	}
	sort.Strings(names)
	specs := make([]string, 0, len(names))
	for _, name := range names {
		entry := lock.Installed[name]
		version, ok := entry["version"].(string)
		if !ok || version == "" {
			return fmt.Errorf("lock entry %q has no exact version", name)
		}
		specs = append(specs, name+"@"+version)
		entry["resolvedPath"] = filepath.ToSlash(filepath.Join("node_modules", name))
	}
	if len(specs) > 0 {
		progress := make(chan pm.Progress)
		done := make(chan struct{})
		go func() {
			for range progress {
			}
			close(done)
		}()
		installErr := pm.Detect().Install(root, specs, progress)
		close(progress)
		<-done
		if installErr != nil {
			return fmt.Errorf("install locked packages: %w", installErr)
		}
	}
	result, err := json.MarshalIndent(lock, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(lockPath, append(result, '\n'), 0o644)
}
