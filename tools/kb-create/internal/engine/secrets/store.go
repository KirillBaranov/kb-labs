// Package secrets contains secret storage adapters. Secret values are resolved
// at execution time and are never part of flow state, plans, journals, or UI
// models.
package secrets

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type Ref struct {
	Name string `json:"name"`
}

type Store interface {
	Get(context.Context, Ref) (string, error)
	Put(context.Context, Ref, string) error
}

type EnvFileStore struct{ Path string }

func (s EnvFileStore) Get(_ context.Context, ref Ref) (string, error) {
	if err := validateName(ref.Name); err != nil {
		return "", err
	}
	data, err := os.ReadFile(s.Path) // #nosec G304 -- path is configured by the installation root.
	if os.IsNotExist(err) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, ref.Name+"=") {
			return strings.TrimPrefix(line, ref.Name+"="), nil
		}
	}
	return "", nil
}

func (s EnvFileStore) Put(_ context.Context, ref Ref, value string) error {
	if err := validateName(ref.Name); err != nil {
		return err
	}
	if s.Path == "" {
		return fmt.Errorf("secret env path is empty")
	}
	data, err := os.ReadFile(s.Path) // #nosec G304 -- path is configured by the installation root.
	if os.IsNotExist(err) {
		data = nil
	} else if err != nil {
		return err
	}
	lines := strings.Split(strings.TrimSuffix(string(data), "\n"), "\n")
	if len(lines) == 1 && lines[0] == "" {
		lines = nil
	}
	replaced := false
	for i, line := range lines {
		if strings.HasPrefix(line, ref.Name+"=") {
			lines[i] = ref.Name + "=" + value
			replaced = true
			break
		}
	}
	if !replaced {
		lines = append(lines, ref.Name+"="+value)
	}
	if err := os.MkdirAll(filepath.Dir(s.Path), 0o750); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(s.Path), ".env-*")
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
		_, err = tmp.WriteString(strings.Join(lines, "\n") + "\n")
	}
	if closeErr := tmp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	if err = os.Rename(name, s.Path); err != nil {
		return err
	}
	ok = true
	return nil
}

func validateName(name string) error {
	if name == "" || strings.ContainsAny(name, "=\r\n") || strings.TrimSpace(name) != name {
		return fmt.Errorf("invalid secret name %q", name)
	}
	return nil
}
