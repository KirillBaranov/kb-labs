package service

import (
	"fmt"
	"sync"
	"time"

	"github.com/kb-labs/dev/internal/config"
)

// Service tracks the runtime state of a single managed service.
type Service struct {
	mu sync.Mutex

	ID     string
	Config config.Service

	// Runtime state.
	State        State
	PID          int
	PGID         int
	StartedAt    time.Time
	RestartCount int
	LastCrash    time.Time
	LastLatency  time.Duration
	StateDetail  string

	// Coordination channels.
	HealthyCh chan struct{} // closed when service becomes alive
	StoppedCh chan struct{} // closed when service becomes dead
}

// New creates a new Service in the dead state.
func New(id string, cfg config.Service) *Service {
	return &Service{
		ID:        id,
		Config:    cfg,
		State:     StateDead,
		HealthyCh: make(chan struct{}),
		StoppedCh: make(chan struct{}),
	}
}

// SetState transitions the service to a new state with validation.
// Thread-safe.
func (s *Service) SetState(next State, detail string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := ValidateTransition(s.State, next); err != nil {
		return fmt.Errorf("service %s: %w", s.ID, err)
	}

	s.State = next
	s.StateDetail = detail

	switch next {
	case StateAlive:
		s.closeCh(&s.HealthyCh)
	case StateDead:
		s.closeCh(&s.StoppedCh)
		// Reset channels for next lifecycle.
		s.HealthyCh = make(chan struct{})
	case StateStarting:
		// Reset channels for new start attempt.
		s.StoppedCh = make(chan struct{})
	case StateFailed:
		s.LastCrash = time.Now()
		// Close healthy so waiters don't hang forever.
		s.closeCh(&s.HealthyCh)
	}

	return nil
}

// GetState returns the current state. Thread-safe.
func (s *Service) GetState() State {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.State
}

// GetDetail returns the current state detail. Thread-safe.
func (s *Service) GetDetail() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.StateDetail
}

// Uptime returns the duration since the service started.
// Returns 0 if the service is not alive.
func (s *Service) Uptime() time.Duration {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.State != StateAlive || s.StartedAt.IsZero() {
		return 0
	}
	return time.Since(s.StartedAt)
}

func (s *Service) closeCh(ch *chan struct{}) {
	select {
	case <-*ch:
		// Already closed.
	default:
		close(*ch)
	}
}
