package docker

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
)

// ContainerInfo is the small ownership projection kb-dev needs from Docker.
// Labels are optional because older/manual containers may not have them.
type ContainerInfo struct {
	ID        string
	Name      string
	Running   bool
	ProjectID string
	Service   string
	Instance  string
}

// ParseContainerInspect parses the tab-separated projection emitted by
// InspectContainer. Keeping this pure makes ownership parsing testable without
// requiring a Docker daemon.
func ParseContainerInspect(output string) (ContainerInfo, error) {
	parts := strings.Split(strings.TrimSpace(output), "\t")
	if len(parts) < 3 || parts[0] == "" {
		return ContainerInfo{}, fmt.Errorf("invalid docker inspect projection")
	}
	info := ContainerInfo{ID: parts[0]}
	if len(parts) > 1 {
		info.Name = strings.TrimPrefix(parts[1], "/")
	}
	info.Running = strings.EqualFold(parts[2], "true")
	if len(parts) > 3 && parts[3] != "<no value>" {
		info.ProjectID = parts[3]
	}
	if len(parts) > 4 && parts[4] != "<no value>" {
		info.Service = parts[4]
	}
	if len(parts) > 5 && parts[5] != "<no value>" {
		info.Instance = parts[5]
	}
	return info, nil
}

// InspectContainer reads identity and optional kb-dev ownership labels.
func InspectContainer(ctx context.Context, name string) (ContainerInfo, error) {
	cmd := exec.CommandContext(ctx, "docker", "inspect", "--format",
		`{{.Id}}	{{.Name}}	{{.State.Running}}	{{index .Config.Labels "com.kb-dev.project"}}	{{index .Config.Labels "com.kb-dev.service"}}	{{index .Config.Labels "com.kb-dev.instance"}}`, name)
	out, err := cmd.Output()
	if err != nil {
		return ContainerInfo{}, err
	}
	return ParseContainerInspect(string(out))
}
