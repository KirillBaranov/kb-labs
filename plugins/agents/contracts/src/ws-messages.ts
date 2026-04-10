/**
 * WebSocket message types for agent event streaming
 */

import type { Turn } from './turn.js';
import type { AgentResponseMode, AgentSmartTieringConfig } from './types.js';

// ═══════════════════════════════════════════════════════════════════════════
// Server → Client Messages
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Connection ready message (server → client)
 * Sent when WS connection is established and ready
 */
export interface ConnectionReadyMessage {
  type: 'connection:ready';
  payload: {
    runId: string;
    connectedAt: string;
  };
  timestamp: number;
}

/**
 * Run completed message (server → client)
 * Sent when the agent run finishes
 */
export interface RunCompletedMessage {
  type: 'run:completed';
  payload: {
    runId: string;
    success: boolean;
    summary: string;
    durationMs: number;
  };
  timestamp: number;
}

/**
 * Error message (server → client)
 */
export interface ErrorMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: number;
}

/**
 * Correction acknowledged message (server → client)
 */
export interface CorrectionAckMessage {
  type: 'correction:ack';
  payload: {
    correctionId: string;
    routedTo: string[]; // Agent IDs that received the correction
    reason: string;
  };
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Turn Snapshot Messages (NEW - Phase 1: Backend Turn Assembly)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Turn snapshot message (server → client)
 * Sent whenever a turn is created or updated (incremental updates)
 */
export interface TurnSnapshotMessage {
  type: 'turn:snapshot';
  payload: {
    sessionId: string;
    turn: Turn;
    sequenceNumber: number;
  };
  timestamp: number;
}

/**
 * Conversation snapshot message (server → client)
 * Sent on initial WebSocket connection to provide recent history
 */
export interface ConversationSnapshotMessage {
  type: 'conversation:snapshot';
  payload: {
    sessionId: string;
    /** Recent completed turns (last 20) */
    completedTurns: Turn[];
    /** Currently streaming turns */
    activeTurns: Turn[];
    /** Total turns in session */
    totalTurns: number;
    /** Snapshot timestamp */
    timestamp: string;
  };
  timestamp: number;
}

/**
 * Union of all server → client messages
 */
export type ServerMessage =
  | ConnectionReadyMessage
  | RunCompletedMessage
  | ErrorMessage
  | CorrectionAckMessage
  | TurnSnapshotMessage
  | ConversationSnapshotMessage;

// ═══════════════════════════════════════════════════════════════════════════
// Client → Server Messages
// ═══════════════════════════════════════════════════════════════════════════

/**
 * User correction message (client → server)
 * User sends a correction/feedback to the orchestrator
 */
export interface UserCorrectionMessage {
  type: 'user:correction';
  payload: {
    /** The correction message from user */
    message: string;
    /** Optional: target specific agent (otherwise orchestrator decides) */
    targetAgentId?: string;
    /** Optional: reference to specific event being corrected */
    refEventId?: string;
  };
  timestamp: number;
}

/**
 * Stop request message (client → server)
 */
export interface StopRequestMessage {
  type: 'user:stop';
  payload: {
    reason?: string;
  };
  timestamp: number;
}

/**
 * Ping message (client → server) for keepalive
 */
export interface PingMessage {
  type: 'ping';
  payload: Record<string, never>;
  timestamp: number;
}

/**
 * Union of all client → server messages
 */
export type ClientMessage =
  | UserCorrectionMessage
  | StopRequestMessage
  | PingMessage;

// ═══════════════════════════════════════════════════════════════════════════
// REST API Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Request body for POST /run
 */
export interface RunRequest {
  /** Task description */
  task: string;
  /** Agent ID to use (optional, defaults to orchestrator) */
  agentId?: string;
  /** Session ID to continue (optional, creates new session if not provided) */
  sessionId?: string;
  /** Working directory (optional) */
  workingDir?: string;
  /** Verbose output */
  verbose?: boolean;
  /** LLM tier (small/medium/large) */
  tier?: 'small' | 'medium' | 'large';
  /** Auto escalate to higher tier when agent is stuck */
  enableEscalation?: boolean;
  /** Adaptive elevation of helper LLM nodes (small -> medium on risk signals) */
  smartTiering?: AgentSmartTieringConfig;
  /** Answer style depth (auto/brief/deep) */
  responseMode?: AgentResponseMode;
}

/**
 * Response for POST /run
 */
export interface RunResponse {
  /** Unique run ID */
  runId: string;
  /** Session ID (existing or newly created) */
  sessionId: string;
  /**
   * Relative WebSocket path for event streaming (e.g. "/v1/ws/plugins/agents/session/:id").
   * Clients construct the full WS URL from their own base URL + this path.
   */
  eventsPath: string;
  /** Run status */
  status: 'started' | 'queued';
  /** Timestamp */
  startedAt: string;
}

/**
 * Request body for POST /run/:runId/correct
 */
export interface CorrectionRequest {
  /** The correction message */
  message: string;
  /** Optional: target specific agent */
  targetAgentId?: string;
}

/**
 * Response for POST /run/:runId/correct
 */
export interface CorrectionResponse {
  /** Unique correction ID */
  correctionId: string;
  /** Agents that received the correction */
  routedTo: string[];
  /** Routing reason from LLM */
  reason: string;
  /** Whether correction was applied */
  applied: boolean;
}

/**
 * Request body for POST /run/:runId/stop
 */
export interface StopRequest {
  /** Reason for stopping (optional) */
  reason?: string;
}

/**
 * Response for POST /run/:runId/stop
 */
export interface StopResponse {
  /** Whether stop was successful */
  stopped: boolean;
  /** Run ID */
  runId: string;
  /** Final status */
  finalStatus: 'stopped' | 'already_completed' | 'not_found';
}

/**
 * Response for GET /run/:runId
 */
export interface RunStatusResponse {
  /** Run ID */
  runId: string;
  /** Current status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stopped';
  /** Task description */
  task: string;
  /** Start time */
  startedAt: string;
  /** End time (if completed) */
  completedAt?: string;
  /** Duration in ms (if completed) */
  durationMs?: number;
  /** Result summary (if completed) */
  summary?: string;
  /** Error message (if failed) */
  error?: string;
  /** Active agents (if running) */
  activeAgents?: Array<{
    id: string;
    task: string;
    status: 'running' | 'waiting';
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Agent List Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Agent specification (for listing available agents)
 */
export interface AgentSpecification {
  /** Unique agent identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of agent capabilities */
  description: string;
  /** List of tools available to this agent */
  tools: string[];
  /** Agent tier/capability level */
  tier?: 'small' | 'medium' | 'large';
}

/**
 * Response for GET /agents
 */
export interface ListAgentsResponse {
  /** Available agents */
  agents: AgentSpecification[];
  /** Total count */
  total: number;
}
