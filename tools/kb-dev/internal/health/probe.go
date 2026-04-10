// Package health provides service health check probes with latency tracking.
package health

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os/exec"
	"strings"
	"time"
)

// ProbeType classifies how to check service health.
type ProbeType int

const (
	// ProbeHTTP checks an HTTP endpoint (GET, accept 2xx/3xx).
	ProbeHTTP ProbeType = iota
	// ProbeCommand runs a shell command (exit 0 = healthy).
	ProbeCommand
	// ProbeTCP checks if a TCP port is reachable.
	ProbeTCP
)

// Probe defines a single health check.
type Probe struct {
	Type    ProbeType
	Target  string        // URL for HTTP, "host:port" for TCP, shell command for Command
	Timeout time.Duration // per-attempt timeout
}

// Result of a single probe execution.
type Result struct {
	OK      bool          `json:"ok"`
	Latency time.Duration `json:"latency"`
	Error   error         `json:"-"`
}

// ClassifyProbe determines probe type from the healthCheck string in config.
func ClassifyProbe(healthCheck string, timeout time.Duration) Probe {
	if timeout == 0 {
		timeout = 3 * time.Second
	}

	if strings.HasPrefix(healthCheck, "http://") || strings.HasPrefix(healthCheck, "https://") {
		return Probe{Type: ProbeHTTP, Target: healthCheck, Timeout: timeout}
	}

	// Check if it looks like host:port.
	if host, port, err := net.SplitHostPort(healthCheck); err == nil && host != "" && port != "" {
		return Probe{Type: ProbeTCP, Target: healthCheck, Timeout: timeout}
	}

	return Probe{Type: ProbeCommand, Target: healthCheck, Timeout: timeout}
}

// Execute runs the probe once and returns the result.
func (p Probe) Execute(ctx context.Context) Result {
	start := time.Now()

	switch p.Type {
	case ProbeHTTP:
		return p.execHTTP(ctx, start)
	case ProbeTCP:
		return p.execTCP(ctx, start)
	case ProbeCommand:
		return p.execCommand(ctx, start)
	default:
		return Result{OK: false, Error: fmt.Errorf("unknown probe type: %d", p.Type)}
	}
}

func (p Probe) execHTTP(ctx context.Context, start time.Time) Result {
	ctx, cancel := context.WithTimeout(ctx, p.Timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.Target, nil)
	if err != nil {
		return Result{OK: false, Latency: time.Since(start), Error: err}
	}

	resp, err := http.DefaultClient.Do(req)
	latency := time.Since(start)

	if err != nil {
		return Result{OK: false, Latency: latency, Error: err}
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode >= 200 && resp.StatusCode < 400 {
		return Result{OK: true, Latency: latency}
	}

	return Result{
		OK:      false,
		Latency: latency,
		Error:   fmt.Errorf("HTTP %d", resp.StatusCode),
	}
}

func (p Probe) execTCP(ctx context.Context, start time.Time) Result {
	dialer := net.Dialer{Timeout: p.Timeout}
	conn, err := dialer.DialContext(ctx, "tcp", p.Target)
	latency := time.Since(start)

	if err != nil {
		return Result{OK: false, Latency: latency, Error: err}
	}
	_ = conn.Close()
	return Result{OK: true, Latency: latency}
}

func (p Probe) execCommand(ctx context.Context, start time.Time) Result {
	ctx, cancel := context.WithTimeout(ctx, p.Timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "bash", "-c", p.Target)
	err := cmd.Run()
	latency := time.Since(start)

	if err != nil {
		return Result{OK: false, Latency: latency, Error: err}
	}
	return Result{OK: true, Latency: latency}
}
