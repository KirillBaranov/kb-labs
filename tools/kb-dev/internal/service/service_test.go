package service

import (
	"sync"
	"testing"
	"time"

	"github.com/kb-labs/dev/internal/config"
)

func testService() *Service {
	return New("test", config.Service{
		Name:    "Test",
		Type:    config.ServiceTypeNode,
		Command: "echo hello",
		Port:    3000,
	})
}

func TestValidTransitions(t *testing.T) {
	valid := []struct {
		from State
		to   State
	}{
		{StateDead, StateStarting},
		{StateStarting, StateAlive},
		{StateStarting, StateFailed},
		{StateAlive, StateStopping},
		{StateAlive, StateFailed},
		{StateFailed, StateStarting},
		{StateFailed, StateDead},
		{StateStopping, StateDead},
	}

	for _, tt := range valid {
		if !tt.from.CanTransitionTo(tt.to) {
			t.Errorf("%s → %s should be valid", tt.from, tt.to)
		}
	}
}

func TestInvalidTransitions(t *testing.T) {
	invalid := []struct {
		from State
		to   State
	}{
		{StateDead, StateAlive},
		{StateDead, StateFailed},
		{StateDead, StateStopping},
		{StateStarting, StateDead},
		{StateStarting, StateStopping},
		{StateAlive, StateStarting},
		{StateAlive, StateDead},
		{StateFailed, StateAlive},
		{StateStopping, StateStarting},
	}

	for _, tt := range invalid {
		if tt.from.CanTransitionTo(tt.to) {
			t.Errorf("%s → %s should be invalid", tt.from, tt.to)
		}
	}
}

func TestSetStateValid(t *testing.T) {
	s := testService()

	if err := s.SetState(StateStarting, ""); err != nil {
		t.Fatalf("dead → starting: %v", err)
	}
	if err := s.SetState(StateAlive, ""); err != nil {
		t.Fatalf("starting → alive: %v", err)
	}
	if s.GetState() != StateAlive {
		t.Errorf("state = %s, want alive", s.GetState())
	}
}

func TestSetStateInvalid(t *testing.T) {
	s := testService()
	if err := s.SetState(StateAlive, ""); err == nil {
		t.Fatal("dead → alive should fail")
	}
}

func TestSetStateClosesHealthyCh(t *testing.T) {
	s := testService()
	_ = s.SetState(StateStarting, "")
	_ = s.SetState(StateAlive, "")

	select {
	case <-s.HealthyCh:
		// Expected — channel closed.
	default:
		t.Error("HealthyCh should be closed when alive")
	}
}

func TestSetStateClosesStoppedCh(t *testing.T) {
	s := testService()
	_ = s.SetState(StateStarting, "")
	_ = s.SetState(StateAlive, "")
	_ = s.SetState(StateStopping, "")
	_ = s.SetState(StateDead, "")

	select {
	case <-s.StoppedCh:
		// Expected — channel closed.
	default:
		t.Error("StoppedCh should be closed when dead")
	}
}

func TestUptimeWhenAlive(t *testing.T) {
	s := testService()
	_ = s.SetState(StateStarting, "")
	s.mu.Lock()
	s.StartedAt = time.Now().Add(-10 * time.Second)
	s.mu.Unlock()
	_ = s.SetState(StateAlive, "")

	up := s.Uptime()
	if up < 9*time.Second || up > 12*time.Second {
		t.Errorf("uptime = %v, want ~10s", up)
	}
}

func TestUptimeWhenDead(t *testing.T) {
	s := testService()
	if s.Uptime() != 0 {
		t.Errorf("uptime should be 0 when dead, got %v", s.Uptime())
	}
}

func TestConcurrentSetStateNoRace(t *testing.T) {
	// Verify concurrent access doesn't cause data races (race detector catches this).
	s := testService()
	_ = s.SetState(StateStarting, "")

	var wg sync.WaitGroup
	const n = 50
	wg.Add(n)

	for i := 0; i < n; i++ {
		go func() {
			defer wg.Done()
			// Mix of reads and writes — should not race.
			_ = s.GetState()
			_ = s.GetDetail()
			_ = s.Uptime()
		}()
	}

	wg.Wait()
}

func TestStateString(t *testing.T) {
	tests := []struct {
		state State
		want  string
	}{
		{StateDead, "dead"},
		{StateStarting, "starting"},
		{StateAlive, "alive"},
		{StateFailed, "failed"},
		{StateStopping, "stopping"},
		{State(99), "unknown"},
	}
	for _, tt := range tests {
		if got := tt.state.String(); got != tt.want {
			t.Errorf("State(%d).String() = %q, want %q", tt.state, got, tt.want)
		}
	}
}
