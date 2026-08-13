// Package render materializes the resolver's exact decision. It never scans
// node_modules to infer services: rendered files are a projection of the plan.
package render

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/kb-labs/create/v2/contracts"
	"gopkg.in/yaml.v3"
)

const ConfigFilename = "kb.config.jsonc"

type Output struct {
	Config      []byte
	Devservices DevservicesFile
}

// DevservicesFile is V2's complete, intentionally small projection format.
// It lives here rather than in the old launcher's helper package so V2 owns
// both its schema validation and its on-disk writes at cutover.
type DevservicesFile struct {
	Name     string             `yaml:"name,omitempty"`
	Services map[string]Service `yaml:"services,omitempty"`
}

type Service struct {
	Name      string            `yaml:"name,omitempty"`
	Command   string            `yaml:"command"`
	Port      int               `yaml:"port,omitempty"`
	DependsOn []string          `yaml:"depends_on,omitempty"`
	Env       map[string]string `yaml:"env,omitempty"`
}

func (file DevservicesFile) Validate() error {
	ids := make([]string, 0, len(file.Services))
	for id := range file.Services {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	ports := make(map[int]string, len(ids))
	for _, id := range ids {
		service := file.Services[id]
		if strings.TrimSpace(id) == "" {
			return fmt.Errorf("service ID is required")
		}
		if strings.TrimSpace(service.Command) == "" {
			return fmt.Errorf("service %q: command is required", id)
		}
		if service.Port == 0 {
			continue
		}
		if owner, exists := ports[service.Port]; exists {
			return fmt.Errorf("services %q and %q both claim port %d", owner, id, service.Port)
		}
		ports[service.Port] = id
	}
	return nil
}

func Build(plan contracts.ResolvedInstallPlan) (Output, error) {
	if plan.Schema != contracts.ResolvedPlanSchema {
		return Output{}, fmt.Errorf("unsupported resolved plan schema %q", plan.Schema)
	}
	services := make(map[string]Service, len(plan.ServiceGraph.Services))
	for _, service := range plan.ServiceGraph.Services {
		if service.ID == "" {
			return Output{}, fmt.Errorf("service ID is required")
		}
		services[service.ID] = Service{Name: service.ID, Command: service.Command, Port: service.Port, DependsOn: service.DependsOn, Env: map[string]string{}}
	}
	file := DevservicesFile{Name: "kb-labs", Services: services}
	if err := file.Validate(); err != nil {
		return Output{}, err
	}
	adapters, plugins := map[string]string{}, map[string]string{}
	extra := map[string]any{}
	for _, patch := range plan.ConfigPatches {
		if patch.Environment != "" {
			for _, serviceID := range patch.Services {
				service, exists := services[serviceID]
				if !exists {
					return Output{}, fmt.Errorf("secret patch %s targets unknown service %q", patch.Owner, serviceID)
				}
				if existing, exists := service.Env[patch.Environment]; exists && existing != "${"+patch.Environment+"}" {
					return Output{}, fmt.Errorf("service %q has conflicting value for secret environment %q", serviceID, patch.Environment)
				}
				service.Env[patch.Environment] = "${" + patch.Environment + "}"
				services[serviceID] = service
			}
		}
		if len(patch.Path) > len("/platform/adapters/") && patch.Path[:len("/platform/adapters/")] == "/platform/adapters/" {
			adapters[patch.Path[len("/platform/adapters/"):]] = patch.Value
		}
		if len(patch.Path) > len("/plugins/") && patch.Path[:len("/plugins/")] == "/plugins/" {
			plugins[patch.Path[len("/plugins/"):]] = patch.Value
		}
		if patch.JSON != "" {
			if err := setConfigValue(extra, patch.Path, patch.JSON); err != nil {
				return Output{}, fmt.Errorf("apply config patch %s: %w", patch.Path, err)
			}
		}
	}
	config := map[string]any{"platform": map[string]any{"version": plan.ServiceGraph.PlatformVersion, "adapters": adapters}, "plugins": plugins}
	merge(config, extra)
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return Output{}, fmt.Errorf("marshal runtime config: %w", err)
	}
	return Output{Config: append(data, '\n'), Devservices: file}, nil
}

func setConfigValue(root map[string]any, pointer, raw string) error {
	if !strings.HasPrefix(pointer, "/") || pointer == "/" {
		return fmt.Errorf("not a JSON pointer")
	}
	var value any
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		return err
	}
	parts := strings.Split(strings.TrimPrefix(pointer, "/"), "/")
	current := root
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
			return fmt.Errorf("crosses non-object %q", key)
		}
		current = child
	}
	key := strings.ReplaceAll(strings.ReplaceAll(parts[len(parts)-1], "~1", "/"), "~0", "~")
	current[key] = value
	return nil
}

func merge(target, source map[string]any) {
	for key, value := range source {
		if child, ok := value.(map[string]any); ok {
			if existing, ok := target[key].(map[string]any); ok {
				merge(existing, child)
				continue
			}
		}
		target[key] = value
	}
}

// Write owns the V2 projections after cutover. Both paths are deterministic
// and atomically swapped; callers serialise full operations via V2 runtime.
func Write(plan contracts.ResolvedInstallPlan) (Output, error) {
	output, err := Build(plan)
	if err != nil {
		return Output{}, err
	}
	root := plan.Request.PlatformRoot
	if err := os.MkdirAll(filepath.Join(root, ".kb"), 0o750); err != nil {
		return Output{}, fmt.Errorf("create config root: %w", err)
	}
	devservices, err := yaml.Marshal(output.Devservices)
	if err != nil {
		return Output{}, fmt.Errorf("marshal devservices: %w", err)
	}
	if err := writeAtomic(filepath.Join(root, ".kb", "devservices.yaml"), devservices, 0o644); err != nil {
		return Output{}, fmt.Errorf("write devservices: %w", err)
	}
	// The platform owns the generated full configuration. Projects retain their
	// own minimal platform pointer through the existing scaffold contract.
	path := filepath.Join(root, ".kb", ConfigFilename)
	if err := writeAtomic(path, output.Config, 0o600); err != nil {
		return Output{}, fmt.Errorf("replace runtime config: %w", err)
	}
	return output, nil
}

func writeAtomic(path string, data []byte, mode os.FileMode) error {
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, data, mode); err != nil {
		return err
	}
	return os.Rename(temporary, path)
}
