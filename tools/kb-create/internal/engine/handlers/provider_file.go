package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// FileProviderBinder persists provider bindings in the engine-owned state
// directory. Runtime config remains owned by ConfigAssembly; this file is the
// reconciliation/readiness marker used by the provider action.
type FileProviderBinder struct{ Root string }

func (b FileProviderBinder) path(capability string) (string, error) {
	if capability == "" || filepath.Base(capability) != capability || strings.Contains(capability, string(filepath.Separator)) {
		return "", fmt.Errorf("invalid provider capability %q", capability)
	}
	return filepath.Join(b.Root, capability+".json"), nil
}

func (b FileProviderBinder) Bound(_ context.Context, capability, provider string) (bool, error) {
	path, err := b.path(capability)
	if err != nil {
		return false, err
	}
	data, err := os.ReadFile(path) // #nosec G304 -- path is constrained to the configured provider state root.
	if os.IsNotExist(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	var state struct {
		Provider string `json:"provider"`
	}
	if err := json.Unmarshal(data, &state); err != nil {
		return false, err
	}
	return state.Provider == provider, nil
}

func (b FileProviderBinder) Bind(_ context.Context, capability, provider, packageSpec string) error {
	path, err := b.path(capability)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(b.Root, 0o750); err != nil {
		return err
	}
	data, err := json.MarshalIndent(map[string]string{"capability": capability, "provider": provider, "package": packageSpec}, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(b.Root, ".provider-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	ok := false
	defer func() {
		if !ok {
			_ = os.Remove(name)
		}
	}()
	if err = tmp.Chmod(0o600); err == nil {
		_, err = tmp.Write(append(data, '\n'))
	}
	if closeErr := tmp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	if err = os.Rename(name, path); err != nil {
		return err
	}
	ok = true
	return nil
}
