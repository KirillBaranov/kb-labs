export const SCHEMA_VERSION = '1.0';

export type ID = string;
export type ISODate = string;

export interface PackageRef {
  name: string;
  version?: string;
  private?: boolean;
  path?: string;
}

export interface RunRef {
  id: ID;
  startedAt: ISODate;
  endedAt?: ISODate;
  status: 'pending' | 'ok' | 'warn' | 'fail';
}

export interface ActionResult {
  ok: boolean;
  message?: string;
  runId?: ID;
}

