package health

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestClassifyProbe(t *testing.T) {
	tests := []struct {
		input string
		want  ProbeType
	}{
		{"http://localhost:3000/health", ProbeHTTP},
		{"https://example.com/ping", ProbeHTTP},
		{"localhost:6379", ProbeTCP},
		{"redis-cli ping", ProbeCommand},
		{"echo ok", ProbeCommand},
	}
	for _, tt := range tests {
		p := ClassifyProbe(tt.input, 0)
		if p.Type != tt.want {
			t.Errorf("ClassifyProbe(%q) = %d, want %d", tt.input, p.Type, tt.want)
		}
	}
}

func TestHTTPProbeOK(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	p := ClassifyProbe(srv.URL, 3*time.Second)
	r := p.Execute(context.Background())
	if !r.OK {
		t.Errorf("expected OK, got error: %v", r.Error)
	}
	if r.Latency == 0 {
		t.Error("latency should be > 0")
	}
}

func TestHTTPProbeFail(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	p := ClassifyProbe(srv.URL, 3*time.Second)
	r := p.Execute(context.Background())
	if r.OK {
		t.Error("expected failure for 500 response")
	}
}

func TestHTTPProbeLatency(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(50 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	p := ClassifyProbe(srv.URL, 3*time.Second)
	r := p.Execute(context.Background())
	if !r.OK {
		t.Fatalf("expected OK, got error: %v", r.Error)
	}
	if r.Latency < 50*time.Millisecond {
		t.Errorf("latency %v should be >= 50ms", r.Latency)
	}
}

func TestCommandProbeOK(t *testing.T) {
	p := ClassifyProbe("echo ok", 5*time.Second)
	r := p.Execute(context.Background())
	if !r.OK {
		t.Errorf("expected OK, got error: %v", r.Error)
	}
}

func TestCommandProbeFail(t *testing.T) {
	p := ClassifyProbe("false", 5*time.Second)
	r := p.Execute(context.Background())
	if r.OK {
		t.Error("expected failure for 'false' command")
	}
}

func TestWaitHealthySuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	p := ClassifyProbe(srv.URL, 3*time.Second)
	c := NewChecker(p, 100*time.Millisecond, 5*time.Second)
	r := c.WaitHealthy(context.Background())
	if !r.OK {
		t.Errorf("expected OK, got error: %v", r.Error)
	}
}

func TestWaitHealthyTimeout(t *testing.T) {
	// Server that always returns 500.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	p := ClassifyProbe(srv.URL, 1*time.Second)
	c := NewChecker(p, 50*time.Millisecond, 200*time.Millisecond)
	r := c.WaitHealthy(context.Background())
	if r.OK {
		t.Error("expected timeout failure")
	}
}

func TestWaitHealthyCancelled(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	p := ClassifyProbe(srv.URL, 1*time.Second)
	c := NewChecker(p, 50*time.Millisecond, 10*time.Second)
	r := c.WaitHealthy(ctx)
	if r.OK {
		t.Error("expected cancellation failure")
	}
}
