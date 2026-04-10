/**
 * @module cli-core/gateway
 *
 * Gateway client SDK for CLI thin client.
 * CLI connects to Gateway server for handler execution,
 * receiving streaming ExecutionEvents.
 */

export * from './types.js';
export { CredentialsManager } from './credentials.js';
export { HttpSseGatewayTransport } from './http-sse-transport.js';
export { TerminalEventRenderer } from './renderer.js';
export type { IEventRenderer } from './renderer.js';
export { HostAgentTransport } from './host-agent-transport.js';
export { resolveTransport } from './transport-resolver.js';
