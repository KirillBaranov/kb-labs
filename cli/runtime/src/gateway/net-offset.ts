import * as fs from 'node:fs';
import * as path from 'node:path';

const BASE_GATEWAY_PORT = 4000;

export function resolveNetOffset(cwd = process.cwd()): number {
  const env = process.env['KB_NET_OFFSET'];
  if (env && /^-?\d+$/.test(env)) {
    return Number.parseInt(env, 10);
  }
  try {
    const raw = fs.readFileSync(path.join(cwd, '.kb', 'net-offset.json'), 'utf8');
    const parsed = JSON.parse(raw) as { offset?: unknown };
    return typeof parsed.offset === 'number' && Number.isInteger(parsed.offset) ? parsed.offset : 0;
  } catch {
    return 0;
  }
}

export function hasLocalRuntimeState(cwd = process.cwd()): boolean {
  return Boolean(process.env['KB_NET_OFFSET']) || fs.existsSync(path.join(cwd, '.kb', 'net-offset.json'));
}

export function resolveLocalGatewayUrl(cwd = process.cwd()): string {
  return `http://127.0.0.1:${BASE_GATEWAY_PORT + resolveNetOffset(cwd)}`;
}
