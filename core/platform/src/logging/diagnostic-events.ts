import type { ILogger } from '../adapters/logger.js';

export type DiagnosticLogLevel = 'debug' | 'info' | 'warn' | 'error';
export type DiagnosticDomain = 'plugin' | 'registry' | 'workflow' | 'service';
export type DiagnosticOutcome = 'started' | 'succeeded' | 'failed' | 'skipped';

export interface DiagnosticLogEvent {
  event: string;
  message: string;
  reasonCode: string;
  level?: DiagnosticLogLevel;
  domain?: DiagnosticDomain;
  outcome?: DiagnosticOutcome;
  error?: Error;
  pluginId?: string;
  pluginVersion?: string;
  serviceId?: string;
  method?: string;
  route?: string;
  stage?: string;
  handlerRef?: string;
  handlerPath?: string;
  manifestPath?: string;
  discoveryCode?: string;
  issues?: string[];
  remediation?: string;
  evidence?: Record<string, unknown>;
}

export function logDiagnosticEvent(logger: ILogger, event: DiagnosticLogEvent): void {
  const attributes: Record<string, unknown> = {
    diagnosticDomain: event.domain ?? 'plugin',
    diagnosticEvent: event.event,
    reasonCode: event.reasonCode,
    ...(event.outcome ? { outcome: event.outcome } : {}),
    ...(event.pluginId ? { pluginId: event.pluginId } : {}),
    ...(event.pluginVersion ? { pluginVersion: event.pluginVersion } : {}),
    ...(event.serviceId ? { serviceId: event.serviceId } : {}),
    ...(event.method ? { method: event.method } : {}),
    ...(event.route ? { route: event.route } : {}),
    ...(event.stage ? { stage: event.stage } : {}),
    ...(event.handlerRef ? { handlerRef: event.handlerRef } : {}),
    ...(event.handlerPath ? { handlerPath: event.handlerPath } : {}),
    ...(event.manifestPath ? { manifestPath: event.manifestPath } : {}),
    ...(event.discoveryCode ? { discoveryCode: event.discoveryCode } : {}),
    ...(event.issues ? { issues: event.issues } : {}),
    ...(event.remediation ? { remediation: event.remediation } : {}),
    ...(event.evidence ? { evidence: event.evidence } : {}),
  };

  switch (event.level ?? 'info') {
    case 'debug':
      logger.debug(event.message, attributes);
      return;
    case 'warn':
      logger.warn(event.message, attributes);
      return;
    case 'error':
      logger.error(event.message, event.error, attributes);
      return;
    default:
      logger.info(event.message, attributes);
  }
}
