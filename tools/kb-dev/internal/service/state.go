// Package service defines the per-service state machine and ServiceRunner interface.
package service

import "fmt"

// State represents the lifecycle state of a service.
type State int

const (
	// StateDead means nothing is running.
	StateDead State = iota
	// StateStarting means the process has been spawned, waiting for health.
	StateStarting
	// StateAlive means the process is running and healthy.
	StateAlive
	// StateFailed means the process crashed or health timed out.
	StateFailed
	// StateStopping means graceful shutdown is in progress.
	StateStopping
)

// String returns the human-readable state name.
func (s State) String() string {
	switch s {
	case StateDead:
		return "dead"
	case StateStarting:
		return "starting"
	case StateAlive:
		return "alive"
	case StateFailed:
		return "failed"
	case StateStopping:
		return "stopping"
	default:
		return "unknown"
	}
}

// validTransitions defines the allowed state transitions.
var validTransitions = map[State][]State{
	StateDead:     {StateStarting},
	StateStarting: {StateAlive, StateFailed},
	StateAlive:    {StateStopping, StateFailed},
	StateFailed:   {StateStarting, StateDead},
	StateStopping: {StateDead},
}

// CanTransitionTo checks if transitioning from s to next is valid.
func (s State) CanTransitionTo(next State) bool {
	for _, allowed := range validTransitions[s] {
		if allowed == next {
			return true
		}
	}
	return false
}

// ValidateTransition returns an error if the transition is invalid.
func ValidateTransition(from, to State) error {
	if !from.CanTransitionTo(to) {
		return fmt.Errorf("invalid state transition: %s → %s", from, to)
	}
	return nil
}
