/**
 * @module logs
 * Log viewing and analysis commands (agent-first).
 *
 * Level 1 — Quick answers:
 *   diagnose  — "What went wrong?" Automated error analysis
 *   context   — Full timeline for an execution/trace/request
 *   summarize — AI-powered log analysis (LLM + fallback)
 *
 * Level 2 — Primitives:
 *   query  — Query with filters (level, source, time range)
 *   search — Full-text search (FTS5)
 *   get    — Get single log by ID + related
 *   stats  — Storage statistics and capabilities
 */

export { logsDiagnose } from './logs-diagnose';
export { logsContext } from './logs-context';
export { logsSummarize } from './logs-summarize';
export { logsQuery } from './logs-query';
export { logsSearch } from './logs-search';
export { logsGet } from './logs-get';
export { logsStats } from './logs-stats';
