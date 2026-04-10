package manager

import (
	"context"
	"fmt"
	"time"

	"github.com/kb-labs/dev/internal/config"
	"github.com/kb-labs/dev/internal/process"
	"github.com/kb-labs/dev/internal/service"
)

const (
	maxRestarts = 5
	maxBackoff  = 30 * time.Second
	stableReset = 5 * time.Minute
)

// Watch monitors all alive node services and restarts them on crash.
// Blocks until ctx is cancelled. Emits events to the Manager's event channel.
func (m *Manager) Watch(ctx context.Context) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.checkServices(ctx)
		}
	}
}

func (m *Manager) checkServices(ctx context.Context) {
	for id, svc := range m.services {
		state := svc.GetState()
		if state != service.StateAlive {
			continue
		}

		// Only watch node services — Docker has its own restart policy.
		if svc.Config.Type != config.ServiceTypeNode {
			continue
		}

		// Check if process is still alive.
		if svc.PID > 0 && process.IsAlive(svc.PID) {
			continue
		}

		// Process died unexpectedly.
		m.emit(Event{
			Event:   "crashed",
			Service: id,
			TS:      time.Now(),
			Detail:  fmt.Sprintf("PID %d exited unexpectedly", svc.PID),
		})

		_ = svc.SetState(service.StateFailed, "process exited unexpectedly")
		svc.RestartCount++
		svc.LastCrash = time.Now()

		// Auto-restart with backoff.
		if svc.RestartCount <= maxRestarts {
			backoff := backoffDuration(svc.RestartCount)
			m.emit(Event{
				Event:   "restarting",
				Service: id,
				TS:      time.Now(),
				Attempt: svc.RestartCount,
				Backoff: backoff.String(),
			})

			time.Sleep(backoff)

			_ = svc.SetState(service.StateDead, "")
			action := m.startOne(ctx, id, false)

			if action.Action == "started" {
				m.emit(Event{
					Event:   "alive",
					Service: id,
					TS:      time.Now(),
					Elapsed: action.Elapsed,
				})
			} else {
				m.emit(Event{
					Event:    "failed",
					Service:  id,
					TS:       time.Now(),
					Error:    action.Error,
					LogsTail: action.LogsTail,
				})
			}
		} else {
			m.emit(Event{
				Event:   "gave_up",
				Service: id,
				TS:      time.Now(),
				Error:   fmt.Sprintf("max restarts (%d) exceeded", maxRestarts),
				Attempt: svc.RestartCount,
			})
		}
	}

	// Reset restart count after stable uptime.
	for _, svc := range m.services {
		if svc.GetState() == service.StateAlive &&
			svc.RestartCount > 0 &&
			!svc.LastCrash.IsZero() &&
			time.Since(svc.LastCrash) > stableReset {
			svc.RestartCount = 0
		}
	}
}

func (m *Manager) emit(e Event) {
	select {
	case m.events <- e:
	default:
		// Drop event if channel is full — don't block service management.
	}
}

func backoffDuration(attempt int) time.Duration {
	d := time.Duration(1<<uint(attempt-1)) * time.Second
	if d > maxBackoff {
		return maxBackoff
	}
	return d
}
