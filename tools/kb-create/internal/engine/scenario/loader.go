// Package scenario loads the declarative scenario documents shipped with the
// new engine. The documents contain UX and projection metadata only; execution
// remains in flow/plan/executor.
package scenario

import (
	"embed"
	"fmt"
	"io/fs"
	"path"
	"sort"

	"github.com/kb-labs/create/internal/engine/flow"
)

//go:embed scenarios/*.json
var files embed.FS

func Load(id string) (flow.Scenario, error) {
	if id == "" || path.Base(id) != id {
		return flow.Scenario{}, fmt.Errorf("invalid scenario id %q", id)
	}
	data, err := files.ReadFile("scenarios/" + id + ".json")
	if err != nil {
		return flow.Scenario{}, fmt.Errorf("scenario %q not found: %w", id, err)
	}
	return flow.Load(data)
}

func IDs() []string {
	descriptors, err := List()
	if err != nil {
		return nil
	}
	ids := make([]string, 0, len(descriptors))
	for _, descriptor := range descriptors {
		ids = append(ids, descriptor.ID)
	}
	return ids
}

type Descriptor struct {
	ID          string `json:"id"`
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
	Pages       int    `json:"pages"`
	HasInstall  bool   `json:"hasInstall"`
}

func List() ([]Descriptor, error) {
	entries, err := fs.Glob(files, "scenarios/*.json")
	if err != nil {
		return nil, err
	}
	descriptors := make([]Descriptor, 0, len(entries))
	for _, entry := range entries {
		id := path.Base(entry[:len(entry)-len(path.Ext(entry))])
		loaded, err := Load(id)
		if err != nil {
			return nil, err
		}
		descriptors = append(descriptors, Descriptor{ID: loaded.ID, Title: loaded.Title, Pages: len(loaded.Pages), HasInstall: loaded.Install != nil})
	}
	sort.Slice(descriptors, func(i, j int) bool { return descriptors[i].ID < descriptors[j].ID })
	return descriptors, nil
}
