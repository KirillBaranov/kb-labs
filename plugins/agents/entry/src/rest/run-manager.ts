/**
 * Run Manager - tracks active agent runs for REST/WS API
 *
 * Uses platform cache for persistence and in-memory Map for active agents.
 * Cache stores serializable run state, Map stores live agent references.
 * Uses platform eventBus for cross-process event broadcasting.
 */

import type { IAgentRunner } from '@kb-labs/agent-sdk';
import type { SessionManager } from '@kb-labs/agent-core';
import type { AgentEvent, AgentEventCallback } from '@kb-labs/agent-contracts';
import { useCache, usePlatform } from '@kb-labs/sdk';

const CACHE_PREFIX = 'agent:run:';
const EVENT_TOPIC_PREFIX = 'agent:events:';
const CACHE_TTL = 3600000; // 1 hour

/**
 * Run status
 */
export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped';

/**
 * Serializable run state (stored in cache)
 */
export interface RunState {
  runId: string;
  task: string;
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  summary?: string;
  error?: string;
}

/**
 * Active run with live agent (in-memory only)
 */
export interface ActiveRun extends RunState {
  agent?: IAgentRunner;
  sessionManager: SessionManager;
  listeners: Set<AgentEventCallback>;
  /** Monotonic sequence counter for event ordering */
  lastSeq: number;
  /** Replay buffer: all events emitted since run start (for late WS connections) */
  eventBuffer: AgentEvent[];
}

/**
 * Run Manager implementation
 */
class RunManagerImpl {
  /** Live agents and listeners (not cacheable) */
  private activeRuns: Map<string, ActiveRun> = new Map();

  /** Session-level listeners: sessionId → Set<callback> — receive events from ALL runs in session */
  private sessionListeners: Map<string, Set<AgentEventCallback>> = new Map();

  /** sessionId per runId — set when run is registered */
  private runSessionMap: Map<string, string> = new Map();

  /**
   * Generate unique run ID
   */
  generateRunId(): string {
    return `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  /**
   * Register a new run
   */
  async register(
    runId: string,
    task: string,
    agent: IAgentRunner | undefined,
    sessionManager: SessionManager,
    sessionId?: string
  ): Promise<ActiveRun> {
    const now = new Date().toISOString();

    const run: ActiveRun = {
      runId,
      task,
      status: 'pending',
      agent,
      sessionManager,
      startedAt: now,
      listeners: new Set(),
      lastSeq: 0,
      eventBuffer: [],
    };

    // Store in memory (for live agent)
    this.activeRuns.set(runId, run);

    // Track sessionId → runId mapping for session-level listeners
    if (sessionId) {
      this.runSessionMap.set(runId, sessionId);
    }

    // Store serializable state in cache
    await this.saveToCache(run);

    return run;
  }

  /**
   * Get run by ID (from memory first, then cache for state)
   */
  get(runId: string): ActiveRun | undefined {
    return this.activeRuns.get(runId);
  }

  /**
   * Check if run exists (in memory or cache)
   */
  async exists(runId: string): Promise<boolean> {
    // Check memory first
    if (this.activeRuns.has(runId)) {
      return true;
    }
    // Fallback to cache
    const state = await this.getState(runId);
    return state !== null;
  }

  /**
   * Get run state from cache (for completed runs or cross-process access)
   */
  async getState(runId: string): Promise<RunState | null> {
    const cache = useCache();
    if (!cache) {return null;}

    return cache.get<RunState>(`${CACHE_PREFIX}${runId}`);
  }

  /**
   * Update run status
   */
  async updateStatus(runId: string, status: RunStatus, extra?: Partial<RunState>): Promise<void> {
    const run = this.activeRuns.get(runId);
    if (run) {
      run.status = status;
      if (extra) {
        Object.assign(run, extra);
      }
      await this.saveToCache(run);
    }
  }

  /**
   * Save run state to cache
   */
  private async saveToCache(run: ActiveRun): Promise<void> {
    const cache = useCache();
    if (!cache) {return;}

    const state: RunState = {
      runId: run.runId,
      task: run.task,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      durationMs: run.durationMs,
      summary: run.summary,
      error: run.error,
    };

    await cache.set(`${CACHE_PREFIX}${run.runId}`, state, CACHE_TTL);
  }

  /** Track subscriptions for cleanup */
  private subscriptions: Map<string, Map<AgentEventCallback, () => void>> = new Map();

  /**
   * Add event listener to run (uses eventBus for cross-process)
   */
  addListener(runId: string, callback: AgentEventCallback): boolean {
    const platform = usePlatform();
    if (!platform?.eventBus) {
      // Fallback to in-memory only
      const run = this.activeRuns.get(runId);
      if (run) {
        run.listeners.add(callback);
        return true;
      }
      return false;
    }

    // Subscribe to eventBus topic for this run
    const topic = `${EVENT_TOPIC_PREFIX}${runId}`;
    const unsubscribe = platform.eventBus.subscribe<AgentEvent>(topic, async (event) => {
      try {
        callback(event);
      } catch {
        // Ignore callback errors
      }
    });

    // Track subscription for cleanup
    if (!this.subscriptions.has(runId)) {
      this.subscriptions.set(runId, new Map());
    }
    this.subscriptions.get(runId)!.set(callback, unsubscribe);

    // Also add to in-memory if run exists locally
    const run = this.activeRuns.get(runId);
    if (run) {
      run.listeners.add(callback);
    }

    return true;
  }

  /**
   * Remove event listener from run
   */
  removeListener(runId: string, callback: AgentEventCallback): void {
    // Unsubscribe from eventBus
    const runSubs = this.subscriptions.get(runId);
    if (runSubs) {
      const unsubscribe = runSubs.get(callback);
      if (unsubscribe) {
        unsubscribe();
        runSubs.delete(callback);
      }
      if (runSubs.size === 0) {
        this.subscriptions.delete(runId);
      }
    }

    // Also remove from in-memory
    const run = this.activeRuns.get(runId);
    if (run) {
      run.listeners.delete(callback);
    }
  }

  /**
   * Broadcast event to all listeners of a run (uses eventBus for cross-process)
   * Assigns monotonic sequence number for reliable ordering
   * @returns The event with seq assigned (for persistence)
   */
  broadcast(runId: string, event: AgentEvent): AgentEvent {
    const platform = usePlatform();
    const run = this.activeRuns.get(runId);

    // Assign sequence number for ordering
    let seqEvent = event;
    if (run) {
      run.lastSeq++;
      seqEvent = { ...event, seq: run.lastSeq, runId };

      // Store in replay buffer (for late WS connections)
      run.eventBuffer.push(seqEvent);
    }

    // Publish to eventBus for cross-process delivery
    if (platform?.eventBus) {
      const topic = `${EVENT_TOPIC_PREFIX}${runId}`;
      platform.eventBus.publish(topic, seqEvent).catch(() => {
        // Ignore publish errors
      });
    }

    // Also notify local in-memory listeners (for same-process)
    if (run) {
      for (const listener of run.listeners) {
        try {
          listener(seqEvent);
        } catch {
          // Ignore listener errors
        }
      }
    }

    // Notify session-level listeners (persistent connections)
    const sessionId = this.runSessionMap.get(runId);
    if (sessionId) {
      const sListeners = this.sessionListeners.get(sessionId);
      if (sListeners) {
        for (const listener of sListeners) {
          try {
            listener(seqEvent);
          } catch {
            // Ignore listener errors
          }
        }
      }
    }

    return seqEvent;
  }

  /**
   * Add a session-level listener — receives events from ALL runs in this session.
   */
  addSessionListener(sessionId: string, callback: AgentEventCallback): void {
    if (!this.sessionListeners.has(sessionId)) {
      this.sessionListeners.set(sessionId, new Set());
    }
    this.sessionListeners.get(sessionId)!.add(callback);
  }

  /**
   * Remove a session-level listener.
   */
  removeSessionListener(sessionId: string, callback: AgentEventCallback): void {
    const listeners = this.sessionListeners.get(sessionId);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.sessionListeners.delete(sessionId);
      }
    }
  }

  /**
   * Get replay buffer for a run (all events emitted since start).
   * Used by WS handler to send missed events on late connection.
   * Optionally filter by afterSeq to only get events the client hasn't seen.
   */
  getEventBuffer(runId: string, afterSeq?: number): AgentEvent[] {
    const run = this.activeRuns.get(runId);
    if (!run) {return [];}

    if (afterSeq != null) {
      return run.eventBuffer.filter((e) => e.seq != null && e.seq > afterSeq);
    }
    return [...run.eventBuffer];
  }

  /**
   * List all active runs
   */
  listActive(): Array<{ runId: string; task: string; status: RunStatus; startedAt: string }> {
    return Array.from(this.activeRuns.values()).map(r => ({
      runId: r.runId,
      task: r.task,
      status: r.status,
      startedAt: r.startedAt,
    }));
  }

  /**
   * Request graceful stop of a running agent (and its child agents via propagated AbortSignal).
   * Agent finishes its current tool call then exits at the next iteration boundary.
   */
  requestStop(runId: string): boolean {
    const run = this.activeRuns.get(runId);
    if (!run || run.status !== 'running' || !run.agent) {
      return false;
    }
    run.agent.requestStop();
    return true;
  }

  /**
   * Clean up completed runs from memory (cache handles its own TTL)
   */
  cleanup(): void {
    for (const [runId, run] of this.activeRuns) {
      if (run.status === 'completed' || run.status === 'failed' || run.status === 'stopped') {
        // Remove from memory but keep in cache
        this.activeRuns.delete(runId);
      }
    }
  }
}

/**
 * Singleton instance — stored on globalThis so all bundled modules share one instance.
 * When tsup compiles multiple entry points, each gets its own module scope,
 * so a plain `export const RunManager = new RunManagerImpl()` creates separate instances.
 * Using globalThis ensures run-handler.js and session-stream-handler.js share one RunManager.
 */
const GLOBAL_KEY = '__kb_agent_run_manager__';
if (!(globalThis as Record<string, unknown>)[GLOBAL_KEY]) {
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = new RunManagerImpl();
}
export const RunManager = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as RunManagerImpl;
