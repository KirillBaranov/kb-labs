/**
 * Runtime contract for the distributable `kb` launcher.
 *
 * Keep this in the entry package, with no workspace imports, so it can run
 * before any platform module loads and fails on a Node 24-only built-in.
 */
export const SUPPORTED_NODE_MAJOR = 24;

export function validateNodeVersion(version: string): string | undefined {
  const match = /^v?(\d+)\.\d+\.\d+$/.exec(version.trim());
  if (!match?.[1]) {
    return `Cannot determine Node.js version from ${JSON.stringify(version)}. KB Labs requires Node.js ${SUPPORTED_NODE_MAJOR}.x.`;
  }
  const major = Number.parseInt(match[1], 10);
  if (major !== SUPPORTED_NODE_MAJOR) {
    return `Node.js ${version} is unsupported; KB Labs supports Node.js ${SUPPORTED_NODE_MAJOR}.x only. Update Node.js and retry (for nvm: nvm install ${SUPPORTED_NODE_MAJOR} && nvm use ${SUPPORTED_NODE_MAJOR}).`;
  }
  return undefined;
}

export function assertSupportedNode(version: string = process.version): void {
  const message = validateNodeVersion(version);
  if (message) {
    throw new Error(message);
  }
}
