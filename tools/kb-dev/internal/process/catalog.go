package process

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// RuntimeCatalog is a host-level index of managed service instances. It is
// deliberately only an index: callers must reconcile PID/start identity before
// treating a record as live or sending a signal.
type RuntimeCatalog struct {
	Records []PIDInfo `json:"records"`
}

func catalogDir() (string, error) {
	if dir := os.Getenv("KB_DEV_RUNTIME_DIR"); dir != "" {
		return dir, nil
	}
	dir, err := os.UserCacheDir()
	if err != nil {
		return "", fmt.Errorf("resolve runtime catalog directory: %w", err)
	}
	return filepath.Join(dir, "kb-dev"), nil
}

func catalogPath() (string, error) {
	dir, err := catalogDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "runtime.json"), nil
}

func readCatalog(path string) (RuntimeCatalog, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return RuntimeCatalog{}, nil
	}
	if err != nil {
		return RuntimeCatalog{}, err
	}
	var catalog RuntimeCatalog
	if err := json.Unmarshal(data, &catalog); err != nil {
		return RuntimeCatalog{}, fmt.Errorf("parse runtime catalog: %w", err)
	}
	return catalog, nil
}

func writeCatalog(path string, catalog RuntimeCatalog) error {
	data, err := json.MarshalIndent(catalog, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp-" + fmt.Sprint(time.Now().UnixNano())
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

// UpdateRuntime adds or replaces a service instance in the host catalog.
func UpdateRuntime(info PIDInfo) error {
	path, err := catalogPath()
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return err
	}
	lock, err := AcquireLockTimeout(dir, 5*time.Second)
	if err != nil {
		return err
	}
	defer lock.Release()
	catalog, err := readCatalog(path)
	if err != nil {
		return err
	}
	found := false
	for i := range catalog.Records {
		record := &catalog.Records[i]
		if record.ProjectID == info.ProjectID && record.Service == info.Service {
			*record = info
			found = true
			break
		}
	}
	if !found {
		catalog.Records = append(catalog.Records, info)
	}
	return writeCatalog(path, catalog)
}

// RemoveRuntime removes all catalog records for one project/service.
func RemoveRuntime(projectID, service string) error {
	path, err := catalogPath()
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	lock, err := AcquireLockTimeout(dir, 5*time.Second)
	if err != nil {
		return err
	}
	defer lock.Release()
	catalog, err := readCatalog(path)
	if err != nil {
		return err
	}
	kept := catalog.Records[:0]
	for _, record := range catalog.Records {
		if record.ProjectID == projectID && (service == "" || record.Service == service) {
			continue
		}
		kept = append(kept, record)
	}
	catalog.Records = kept
	if len(kept) == 0 {
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return err
		}
		return nil
	}
	return writeCatalog(path, catalog)
}

// ListRuntime returns a snapshot of the host catalog. It never mutates the
// catalog; reconciliation is left to the caller so stale entries are visible.
func ListRuntime() ([]PIDInfo, error) {
	path, err := catalogPath()
	if err != nil {
		return nil, err
	}
	catalog, err := readCatalog(path)
	if err != nil {
		return nil, err
	}
	return catalog.Records, nil
}
