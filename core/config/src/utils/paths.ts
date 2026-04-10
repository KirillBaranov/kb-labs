import path from 'node:path';

/**
 * Get profiles root directory
 */
export function getProfilesRootDir(cwd: string): string {
  return path.join(cwd, '.kb', 'profiles');
}

/**
 * Get product configuration directory
 */
export function getProductConfigDir(cwd: string, fsProduct: string): string {
  return path.join(cwd, '.kb', fsProduct);
}

/**
 * Get product configuration file path
 */
export function getProductConfigPath(cwd: string, fsProduct: string): string {
  return path.join(getProductConfigDir(cwd, fsProduct), `${fsProduct}.config.json`);
}

/**
 * Get .kb root directory
 */
export function getKbRootDir(cwd: string): string {
  return path.join(cwd, '.kb');
}

/**
 * Get lockfile path
 */
export function getLockfilePath(cwd: string): string {
  return path.join(getKbRootDir(cwd), 'lock.json');
}

