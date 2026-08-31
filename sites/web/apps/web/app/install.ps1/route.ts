/**
 * `kblabs.ru/install.ps1` — retired.
 *
 * Windows was removed from the support matrix in the release control-plane
 * cutover (decision S0.3c: linux/darwin x amd64/arm64), and
 * `tools/kb-create/install.ps1` was deleted with it. This route used to 307 to
 * that file on raw.githubusercontent.com, so it now redirects to a 404 — which
 * is the worst available answer, because `irm … | iex` would surface GitHub's
 * HTML error page as a PowerShell parse error rather than as "this is gone".
 *
 * So the route stays, and answers for itself. It is the same reasoning as the
 * legacy channel tombstone (execution addendum §7.2): the retired path has to
 * fail deterministically and legibly, not merely fail.
 *
 * 410 rather than 404: the resource existed and was deliberately withdrawn, and
 * `iex` on this body is a syntax error immediately, before anything is fetched
 * or run.
 */
const RETIRED_NOTICE = `# KB Labs — Windows installation is no longer supported.
#
# The launcher publishes for linux and darwin on amd64 and arm64 only.
#
# On WSL2, or on a Linux or macOS machine:
#
#   curl -fsSL https://kblabs.ru/install.sh | sh
#
# See https://kblabs.ru/docs for the supported platforms.
Write-Error "KB Labs does not support Windows. Install under WSL2 with: curl -fsSL https://kblabs.ru/install.sh | sh"
exit 1
`;

export function GET() {
  return new Response(RETIRED_NOTICE, {
    status: 410,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
