package env

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Meta is the lightweight record of the live environment (one per Layout).
type Meta struct {
	Profile   string         `json:"profile"`
	Mode      string         `json:"mode"`
	PortBase  int            `json:"portBase"`
	Ports     map[string]int `json:"ports,omitempty"`
	Status    string         `json:"status"` // provisioning | running | stopped | broken
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
}

func (l Layout) metaPath() string { return filepath.Join(l.Root, "meta.json") }

// WriteMeta persists meta atomically (temp + rename).
func (l Layout) WriteMeta(m Meta) error {
	m.UpdatedAt = time.Now()
	if m.CreatedAt.IsZero() {
		m.CreatedAt = m.UpdatedAt
	}
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	tmp := l.metaPath() + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, l.metaPath())
}

// ReadMeta loads the environment record.
func (l Layout) ReadMeta() (Meta, error) {
	data, err := os.ReadFile(l.metaPath())
	if err != nil {
		return Meta{}, fmt.Errorf("no live environment (read meta: %w)", err)
	}
	var m Meta
	if err := json.Unmarshal(data, &m); err != nil {
		return Meta{}, fmt.Errorf("parse meta: %w", err)
	}
	return m, nil
}
