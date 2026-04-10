// Package docker wraps docker CLI for build and push operations.
package docker

import (
	"context"
	"fmt"
	"io"
	"os/exec"
)

// ImageTag constructs the full image tag: registry/image:sha.
func ImageTag(registry, image, sha string) string {
	return fmt.Sprintf("%s/%s:%s", registry, image, sha)
}

// Build runs `docker build -t tag -f dockerfile context` and streams output to w.
func Build(ctx context.Context, tag, dockerfile, contextDir string, w io.Writer) error {
	cmd := exec.CommandContext(ctx, "docker", "build", "-t", tag, "-f", dockerfile, contextDir)
	cmd.Stdout = w
	cmd.Stderr = w
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("docker build: %w", err)
	}
	return nil
}

// Push runs `docker push tag` and streams output to w.
func Push(ctx context.Context, tag string, w io.Writer) error {
	cmd := exec.CommandContext(ctx, "docker", "push", tag)
	cmd.Stdout = w
	cmd.Stderr = w
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("docker push: %w", err)
	}
	return nil
}
