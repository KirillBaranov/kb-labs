package artifacts

import (
	"crypto/sha256"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/kb-labs/create/v2/contracts"
)

// Binaries installs immutable platform tools after verifying their release
// checksum. Files are private to the V2 platform root, never global PATH.
type Binaries struct {
	Root   string
	Client *http.Client
}

func (b Binaries) Install(items []contracts.Artifact) error {
	for _, item := range items {
		if item.Kind != "binary" {
			continue
		}
		if item.URL == "" || item.SHA256 == "" || item.Target == "" {
			return fmt.Errorf("binary %q lacks url, hash or target", item.ID)
		}
		client := b.Client
		if client == nil {
			client = http.DefaultClient
		}
		response, err := client.Get(item.URL)
		if err != nil {
			return fmt.Errorf("download binary %s: %w", item.ID, err)
		}
		data, readErr := io.ReadAll(response.Body)
		_ = response.Body.Close()
		if readErr != nil || response.StatusCode < 200 || response.StatusCode >= 300 {
			return fmt.Errorf("download binary %s: status %d: %v", item.ID, response.StatusCode, readErr)
		}
		sum := fmt.Sprintf("%x", sha256.Sum256(data))
		if sum != item.SHA256 {
			return fmt.Errorf("binary %s checksum mismatch", item.ID)
		}
		path := filepath.Join(b.Root, ".kb", "v2", "bin", filepath.Base(item.Target))
		if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
			return err
		}
		if err := os.WriteFile(path+".tmp", data, 0o700); err != nil {
			return err
		}
		if err := os.Rename(path+".tmp", path); err != nil {
			return err
		}
	}
	return nil
}

type Composite struct {
	Packages Pnpm
	Binaries Binaries
}

func (c Composite) Install(items []contracts.Artifact) error {
	if err := c.Packages.Install(items); err != nil {
		return err
	}
	return c.Binaries.Install(items)
}
func (c Composite) Restore() error { return c.Packages.Restore() }
func (c Composite) Uninstall(items []contracts.Artifact) error {
	if err := c.Packages.Uninstall(items); err != nil {
		return err
	}
	for _, item := range items {
		if item.Kind != "binary" {
			continue
		}
		if err := os.Remove(filepath.Join(c.Binaries.Root, ".kb", "v2", "bin", filepath.Base(item.Target))); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}
