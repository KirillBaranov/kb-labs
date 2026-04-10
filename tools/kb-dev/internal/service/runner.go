package service

import (
	"context"
	"time"
)

// Runner abstracts how a service is started and stopped.
// Currently only LocalRunner exists (in the process package).
// Future implementations: DockerComposeRunner, RemoteRunner (SSH).
type Runner interface {
	// Start spawns the service process. Returns PID and PGID on success.
	Start(ctx context.Context, svc *Service) (pid int, pgid int, err error)

	// Stop gracefully shuts down the service.
	Stop(ctx context.Context, svc *Service, gracePeriod time.Duration) error

	// IsRunning checks if the service process is still alive.
	IsRunning(svc *Service) bool
}
