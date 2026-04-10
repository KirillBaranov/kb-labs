export type TelemetryEvent = {
  ts: string; // ISO timestamp
  name: string; // e.g. "cli_start", "cmd_end"
  props?: Record<string, unknown>;
};

export interface TelemetrySink {
  emit(ev: TelemetryEvent): Promise<void>;
}
