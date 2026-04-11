package manager

import (
	"context"
	"fmt"
	"path/filepath"
	"sync"
	"time"

	"github.com/kb-labs/dev/internal/config"
	"github.com/kb-labs/dev/internal/docker"
	"github.com/kb-labs/dev/internal/environ"
	"github.com/kb-labs/dev/internal/health"
	"github.com/kb-labs/dev/internal/logger"
	"github.com/kb-labs/dev/internal/process"
	"github.com/kb-labs/dev/internal/service"
)

const (
	defaultGracePeriod = 5 * time.Second
	slowThreshold      = 2 * time.Second
	logTailLines       = 5
)

// Manager orchestrates service lifecycle operations.
type Manager struct {
	cfg      *config.Config
	services map[string]*service.Service
	rootDir  string
	envCache *environ.EnvCache
	events   chan Event

	// Per-service locks prevent concurrent start/stop of the same service.
	// Without this, "ensure rest gateway" can try to start redis twice
	// because both rest and gateway depend on it and resolve deps in parallel.
	svcLocks map[string]*sync.Mutex
}

// New creates a Manager from a parsed config.
func New(cfg *config.Config, rootDir string) *Manager {
	m := &Manager{
		cfg:      cfg,
		services: make(map[string]*service.Service),
		rootDir:  rootDir,
		events:   make(chan Event, 100),
		svcLocks: make(map[string]*sync.Mutex),
	}

	for id, svcCfg := range cfg.Services {
		m.services[id] = service.New(id, svcCfg)
		m.svcLocks[id] = &sync.Mutex{}
	}

	return m
}

// spawnEnv returns the env map to pass to a spawned service, merging the
// service's own Env with KB Labs conventional variables (KB_PROJECT_ROOT) so
// that services using @kb-labs/core-runtime's loadPlatformConfig / resolveRoots
// can locate the user's .kb/kb.config.json regardless of their own cwd.
func (m *Manager) spawnEnv(svcEnv map[string]string) map[string]string {
	merged := make(map[string]string, len(svcEnv)+1)
	for k, v := range svcEnv {
		merged[k] = v
	}
	// Do not overwrite if already set — the service or the launching shell
	// may have a good reason to pin it to a different value.
	if _, ok := merged["KB_PROJECT_ROOT"]; !ok {
		merged["KB_PROJECT_ROOT"] = m.rootDir
	}
	return merged
}

// Reconcile checks PID files against running processes and updates service states.
func (m *Manager) Reconcile() error {
	pidDir := filepath.Join(m.rootDir, m.cfg.Settings.PIDDir)
	alive, err := process.Reconcile(pidDir)
	if err != nil {
		return fmt.Errorf("reconcile PIDs: %w", err)
	}

	for id, svc := range m.services {
		info, ok := alive[id]
		if !ok {
			continue
		}

		svc.PID = info.PID
		svc.PGID = info.PGID
		svc.StartedAt = info.StartedAt

		// Check health to determine if alive or degraded.
		if svc.Config.HealthCheck != "" {
			probe := health.ClassifyProbe(svc.Config.HealthCheck, 3*time.Second)
			result := probe.Execute(context.Background())
			if result.OK {
				_ = svc.SetState(service.StateStarting, "")
				_ = svc.SetState(service.StateAlive, "")
				svc.LastLatency = result.Latency
			} else {
				_ = svc.SetState(service.StateStarting, "")
				_ = svc.SetState(service.StateFailed, "process running but health check fails")
			}
		} else {
			// No health check — if PID is alive, assume alive.
			_ = svc.SetState(service.StateStarting, "")
			_ = svc.SetState(service.StateAlive, "")
		}
	}

	return nil
}

// ResolveEnv loads or creates the environment cache.
func (m *Manager) ResolveEnv() {
	cachePath := filepath.Join(m.rootDir, m.cfg.Settings.PIDDir, "env-cache.json")

	cache, _ := environ.LoadCache(cachePath)
	if cache != nil && !cache.IsStale() {
		m.envCache = cache
		return
	}

	cache = environ.Resolve()
	_ = cache.Save(cachePath)
	m.envCache = cache
}

// withLock acquires a cross-process file lock for mutation operations.
// Prevents two concurrent kb-dev instances from starting/stopping the same services.
func (m *Manager) withLock(fn func() *Result) *Result {
	lock, err := process.AcquireLock(filepath.Join(m.rootDir, m.cfg.Settings.PIDDir))
	if err != nil {
		return &Result{
			OK:      false,
			Actions: []Action{{Action: "failed", Error: err.Error()}},
			Hint:    "another kb-dev instance is running. Wait for it to finish or kill it: pkill -f kb-dev",
		}
	}
	defer lock.Release()

	// Re-reconcile under lock — state may have changed while waiting.
	_ = m.Reconcile()

	return fn()
}

// Start starts the specified services with dependency resolution.
// Acquires a cross-process file lock to prevent duplicate starts from concurrent kb-dev instances.
func (m *Manager) Start(ctx context.Context, targets []string, force bool) *Result {
	return m.withLock(func() *Result {
		return m.startInternal(ctx, targets, force)
	})
}

func (m *Manager) startInternal(ctx context.Context, targets []string, force bool) *Result {
	allNeeded := DepsOf(targets, m.cfg.Services)
	layers, _ := TopoLayers(m.cfg.Services)

	var allActions []Action
	failed := false

	for _, layer := range layers {
		var layerTargets []string
		for _, id := range layer {
			if contains(allNeeded, id) {
				layerTargets = append(layerTargets, id)
			}
		}
		if len(layerTargets) == 0 {
			continue
		}

		actions := m.startLayer(ctx, layerTargets, force)
		allActions = append(allActions, actions...)
		for _, a := range actions {
			if a.Action == "failed" {
				failed = true
			}
		}
		if failed {
			break
		}
	}

	result := &Result{OK: !failed, Actions: allActions}
	if failed {
		result.Hint = "some services failed to start. Check logs: kb-dev logs <service>"
	}
	return result
}

func (m *Manager) startLayer(ctx context.Context, targets []string, force bool) []Action {
	var (
		mu      sync.Mutex
		actions []Action
		wg      sync.WaitGroup
	)

	for _, id := range targets {
		id := id
		wg.Add(1)
		go func() {
			defer wg.Done()
			a := m.startOne(ctx, id, force)
			mu.Lock()
			actions = append(actions, a)
			mu.Unlock()
		}()
	}

	wg.Wait()
	return actions
}

func (m *Manager) startOne(ctx context.Context, id string, force bool) Action {
	// Per-service lock prevents duplicate starts when multiple dependents
	// resolve the same dependency in parallel.
	m.svcLocks[id].Lock()
	defer m.svcLocks[id].Unlock()

	svc := m.services[id]
	state := svc.GetState()

	// Already alive — skip (re-check under lock).
	if state == service.StateAlive {
		return Action{Service: id, Action: "skipped", Reason: "already alive"}
	}

	// Port conflict — force kill or report.
	if svc.Config.Port > 0 && force {
		_ = process.KillPort(svc.Config.Port)
		time.Sleep(300 * time.Millisecond)
	}

	// Docker services.
	if svc.Config.Type == config.ServiceTypeDocker {
		return m.startDocker(ctx, svc)
	}

	// Node services.
	return m.startNode(ctx, svc)
}

func (m *Manager) startDocker(ctx context.Context, svc *service.Service) Action {
	start := time.Now()

	if err := docker.EnsureRunning(ctx); err != nil {
		return Action{Service: svc.ID, Action: "failed", Error: "Docker unavailable: " + err.Error()}
	}

	_ = svc.SetState(service.StateStarting, "")

	logsDir := filepath.Join(m.rootDir, m.cfg.Settings.LogsDir)
	_ = logger.Clear(logsDir, svc.ID)

	// Run docker command via spawn.
	spawnResult, err := process.Spawn(process.SpawnOpts{
		Command:  svc.Config.Command,
		Env:      m.spawnEnv(svc.Config.Env),
		Dir:      m.rootDir,
		LogFile:  logger.LogPath(logsDir, svc.ID),
		EnvCache: m.envCache,
	})
	if err != nil {
		_ = svc.SetState(service.StateFailed, err.Error())
		return Action{Service: svc.ID, Action: "failed", Error: err.Error()}
	}

	svc.PID = spawnResult.PID
	svc.PGID = spawnResult.PGID
	svc.StartedAt = start

	pidDir := filepath.Join(m.rootDir, m.cfg.Settings.PIDDir)
	pidInfo := process.NewPIDInfo(svc.ID, spawnResult.PID, spawnResult.PGID, svc.Config.Command)
	_ = process.WritePID(pidDir, pidInfo)

	// Wait for health.
	if svc.Config.HealthCheck != "" {
		time.Sleep(2 * time.Second) // Docker containers need a moment.
		result := m.waitHealth(ctx, svc)
		if !result.OK {
			_ = svc.SetState(service.StateFailed, "health check failed")
			tail, _ := logger.Tail(logsDir, svc.ID, logTailLines)
			return Action{
				Service:  svc.ID,
				Action:   "failed",
				Error:    "health check timeout",
				LogsTail: tail,
				Elapsed:  time.Since(start).Truncate(time.Millisecond).String(),
			}
		}
		svc.LastLatency = result.Latency
	}

	_ = svc.SetState(service.StateAlive, "")
	return Action{Service: svc.ID, Action: "started", Elapsed: time.Since(start).Truncate(time.Millisecond).String()}
}

func (m *Manager) startNode(ctx context.Context, svc *service.Service) Action {
	start := time.Now()
	_ = svc.SetState(service.StateStarting, "")

	logsDir := filepath.Join(m.rootDir, m.cfg.Settings.LogsDir)
	pidDir := filepath.Join(m.rootDir, m.cfg.Settings.PIDDir)

	_ = logger.EnsureDir(logsDir)
	_ = logger.Clear(logsDir, svc.ID)

	result, err := process.Spawn(process.SpawnOpts{
		Command:  svc.Config.Command,
		Env:      m.spawnEnv(svc.Config.Env),
		Dir:      m.rootDir,
		LogFile:  logger.LogPath(logsDir, svc.ID),
		EnvCache: m.envCache,
	})
	if err != nil {
		_ = svc.SetState(service.StateFailed, err.Error())
		return Action{Service: svc.ID, Action: "failed", Error: err.Error()}
	}

	svc.PID = result.PID
	svc.PGID = result.PGID
	svc.StartedAt = start

	// Write rich PID file.
	pidInfo := process.NewPIDInfo(svc.ID, result.PID, result.PGID, svc.Config.Command)
	_ = process.WritePID(pidDir, pidInfo)

	// Wait for health check.
	if svc.Config.HealthCheck != "" {
		hr := m.waitHealth(ctx, svc)
		if !hr.OK {
			_ = svc.SetState(service.StateFailed, "health check failed")
			tail, _ := logger.Tail(logsDir, svc.ID, logTailLines)
			return Action{
				Service:  svc.ID,
				Action:   "failed",
				Error:    fmt.Sprintf("health check timeout after %s", m.startTimeout()),
				LogsTail: tail,
				Elapsed:  time.Since(start).Truncate(time.Millisecond).String(),
			}
		}
		svc.LastLatency = hr.Latency
	}

	_ = svc.SetState(service.StateAlive, "")
	return Action{Service: svc.ID, Action: "started", Elapsed: time.Since(start).Truncate(time.Millisecond).String()}
}

func (m *Manager) waitHealth(ctx context.Context, svc *service.Service) health.Result {
	probe := health.ClassifyProbe(svc.Config.HealthCheck, 3*time.Second)
	checker := health.NewChecker(
		probe,
		time.Duration(m.cfg.Settings.HealthCheckInterval)*time.Millisecond,
		m.startTimeout(),
	)
	return checker.WaitHealthy(ctx)
}

func (m *Manager) startTimeout() time.Duration {
	return time.Duration(m.cfg.Settings.StartTimeout) * time.Millisecond
}

// Stop stops the specified services.
func (m *Manager) Stop(ctx context.Context, targets []string, cascade bool) *Result {
	return m.withLock(func() *Result {
		return m.stopInternal(ctx, targets, cascade)
	})
}

func (m *Manager) stopInternal(_ context.Context, targets []string, cascade bool) *Result {
	toStop := make([]string, len(targets))
	copy(toStop, targets)

	if cascade {
		for _, t := range targets {
			deps := m.cfg.Dependents(t)
			for _, d := range deps {
				if !contains(toStop, d) {
					toStop = append(toStop, d)
				}
			}
		}
	}

	var actions []Action
	pidDir := filepath.Join(m.rootDir, m.cfg.Settings.PIDDir)

	// Stop in reverse dependency order — dependents first.
	for i := len(toStop) - 1; i >= 0; i-- {
		id := toStop[i]
		svc := m.services[id]
		state := svc.GetState()

		if state == service.StateDead {
			actions = append(actions, Action{Service: id, Action: "skipped", Reason: "already stopped"})
			continue
		}

		_ = svc.SetState(service.StateStopping, "")

		switch {
		case svc.Config.Type == config.ServiceTypeDocker && svc.Config.StopCommand != "":
			_, _ = process.Spawn(process.SpawnOpts{Command: svc.Config.StopCommand, Dir: m.rootDir})
		case svc.PGID > 0:
			_ = process.KillGroup(svc.PGID, defaultGracePeriod)
		case svc.Config.Port > 0:
			_ = process.KillPort(svc.Config.Port)
		}

		_ = process.RemovePID(pidDir, id)
		_ = svc.SetState(service.StateDead, "")
		svc.PID = 0
		svc.PGID = 0

		actions = append(actions, Action{Service: id, Action: "stopped"})
	}

	return &Result{OK: true, Actions: actions}
}

// Restart stops then starts services, with optional cascade.
func (m *Manager) Restart(ctx context.Context, targets []string, cascade, force bool) *Result {
	return m.withLock(func() *Result {
		stopResult := m.stopInternal(ctx, targets, cascade)
		time.Sleep(500 * time.Millisecond)
		startResult := m.startInternal(ctx, targets, force)

		allActions := make([]Action, 0, len(stopResult.Actions)+len(startResult.Actions))
		allActions = append(allActions, stopResult.Actions...)
		allActions = append(allActions, startResult.Actions...)
		return &Result{
			OK:      startResult.OK,
			Actions: allActions,
			Hint:    startResult.Hint,
		}
	})
}

// Ensure brings targets to alive state idempotently.
// Already alive → skip. Dead → start. Failed → restart.
func (m *Manager) Ensure(ctx context.Context, targets []string) *Result {
	return m.withLock(func() *Result {
		var actions []Action
		toStart := make([]string, 0)

		for _, id := range targets {
			svc := m.services[id]
			state := svc.GetState()

			switch state {
			case service.StateAlive:
				actions = append(actions, Action{Service: id, Action: "skipped", Reason: "already alive"})
			case service.StateFailed:
				_ = svc.SetState(service.StateDead, "")
				toStart = append(toStart, id)
			default:
				toStart = append(toStart, id)
			}
		}

		if len(toStart) > 0 {
			result := m.startInternal(ctx, toStart, true)
			actions = append(actions, result.Actions...)
			if !result.OK {
				return &Result{OK: false, Actions: actions, Hint: result.Hint}
			}
		}

		return &Result{OK: true, Actions: actions}
	})
}

// Ready blocks until all targets are alive or timeout expires.
func (m *Manager) Ready(ctx context.Context, targets []string, timeout time.Duration) *Result {
	deadline := time.After(timeout)
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		allAlive := true
		for _, id := range targets {
			svc := m.services[id]
			if svc.GetState() != service.StateAlive {
				allAlive = false
				break
			}
		}

		if allAlive {
			var actions []Action
			for _, id := range targets {
				actions = append(actions, Action{Service: id, Action: "ready"})
			}
			return &Result{OK: true, Actions: actions}
		}

		select {
		case <-ctx.Done():
			return &Result{OK: false, Hint: "cancelled"}
		case <-deadline:
			var actions []Action
			for _, id := range targets {
				svc := m.services[id]
				state := svc.GetState()
				if state != service.StateAlive {
					actions = append(actions, Action{
						Service: id,
						Action:  "not_ready",
						Error:   fmt.Sprintf("state: %s", state),
					})
				}
			}
			return &Result{OK: false, Actions: actions, Hint: fmt.Sprintf("timeout after %s waiting for services", timeout)}
		case <-ticker.C:
			// continue polling
		}
	}
}

// Status returns the current state of all services.
func (m *Manager) Status() *StatusResult {
	result := &StatusResult{
		OK:       true,
		Services: make(map[string]ServiceStatus),
	}

	for id, svc := range m.services {
		state := svc.GetState()
		ss := ServiceStatus{
			State:  state.String(),
			Port:   svc.Config.Port,
			URL:    svc.Config.URL,
			Deps:   svc.Config.DependsOn,
			Detail: svc.GetDetail(),
		}

		// Resolved dependency states.
		if len(svc.Config.DependsOn) > 0 {
			ss.DepsState = make(map[string]string)
			for _, dep := range svc.Config.DependsOn {
				if depSvc, ok := m.services[dep]; ok {
					ss.DepsState[dep] = depSvc.GetState().String()
				}
			}
		}

		if state == service.StateAlive || state == service.StateStarting {
			ss.PID = svc.PID
			ss.PGID = svc.PGID
			if !svc.StartedAt.IsZero() {
				ss.StartedAt = svc.StartedAt.Format(time.RFC3339)
				ss.Uptime = time.Since(svc.StartedAt).Truncate(time.Second).String()
			}
		}

		if state == service.StateAlive && svc.LastLatency > 0 {
			ss.Health = &ServiceHealth{
				OK:      true,
				Latency: svc.LastLatency.Truncate(time.Millisecond).String(),
				Slow:    svc.LastLatency > slowThreshold,
			}
		}

		// Resource usage (CPU/memory) for alive processes.
		if svc.PID > 0 && (state == service.StateAlive || state == service.StateStarting) {
			if ru := process.GetResourceUsage(svc.PID); ru != nil {
				ss.Resources = &ResourceUsage{
					CPU:    fmt.Sprintf("%.1f%%", ru.CPUPercent),
					Memory: process.FormatMemory(ru.RSSBytes),
					RSS:    ru.RSSBytes,
				}
			}
		}

		result.Services[id] = ss

		// Count states.
		switch state {
		case service.StateAlive:
			result.Summary.Alive++
		case service.StateStarting:
			result.Summary.Starting++
		case service.StateFailed:
			result.Summary.Failed++
		case service.StateStopping:
			result.Summary.Stopping++
		default:
			result.Summary.Dead++
		}
	}

	result.Summary.Total = len(m.services)
	return result
}

// Health runs health probes on all services and returns results.
func (m *Manager) Health() *HealthResult {
	result := &HealthResult{
		OK:       true,
		Services: make(map[string]*ServiceHealth),
	}

	ctx := context.Background()

	for id, svc := range m.services {
		if svc.Config.HealthCheck == "" {
			// No health check configured — skip, don't mark as failed.
			continue
		}

		probe := health.ClassifyProbe(svc.Config.HealthCheck, 3*time.Second)
		r := probe.Execute(ctx)

		sh := &ServiceHealth{OK: r.OK}
		if r.OK {
			sh.Latency = r.Latency.Truncate(time.Millisecond).String()
			sh.Slow = r.Latency > slowThreshold
		}
		result.Services[id] = sh
		if !r.OK {
			result.OK = false
		}
	}

	return result
}

// Events returns the event channel for streaming.
func (m *Manager) Events() <-chan Event {
	return m.events
}

// GetService returns a service by ID.
func (m *Manager) GetService(id string) *service.Service {
	return m.services[id]
}

// Config returns the manager's config.
func (m *Manager) Config() *config.Config {
	return m.cfg
}

// RootDir returns the workspace root directory.
func (m *Manager) RootDir() string {
	return m.rootDir
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}
