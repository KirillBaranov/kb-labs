---
name: check-links
description: Broken-link checker for KB Labs sites (web + docs). Auto-loaded when editing sites/** or the check-links script. Covers script logic, devkit integration, suppression, and fixing broken links.
globs:
  - sites/web/**
  - sites/web/apps/web/scripts/check-links.mjs
---

# check-links — Broken Link Checker

Script: `sites/web/apps/web/scripts/check-links.mjs`
Devkit entry: `custom_checks[check-links]` in `devkit.yaml`

## What it checks

| Check | Trigger | Severity |
|---|---|---|
| `BROKEN_INTERNAL` | href resolves to no Next.js route | error |
| `BROKEN_EXTERNAL` | HTTP HEAD on a controlled origin returns 4xx | error |
| `BROKEN_EXTERNAL` | HTTP HEAD returns 5xx or times out | warning |

**Controlled origins** (HTTP-checked): `kblabs.ru`, `docs.kblabs.ru`, `status.kblabs.ru`.  
All other external URLs (GitHub, Telegram, etc.) are skipped.

## CI/CD

`on: [check]` in devkit.yaml → `kb-devkit run check` → in CI matrix (`ci.yml`, `ci-pr.yml`).  
**Errors block PR merges. Warnings do not.**

## Running manually

```bash
# from workspace root
node sites/web/apps/web/scripts/check-links.mjs

# via pnpm
pnpm --filter @kb-labs/web-site check:links
```

## Href patterns recognized

The script extracts these patterns from `.tsx`, `.ts`, `.md`, `.mdx`:

```tsx
href="/product/kb-dev"           // JSX attr — static string
href: '/solutions/code-quality'  // object/array property
lp('/install')                   // locale-prefix helper → internal path
href={`/${locale}/changelog`}    // template literal — static path after ${locale}
```

Dynamic hrefs (`href={item.href}`, `href={\`/en/${slug}\`}`) are skipped.

## Suppression

Add `// link-ignore` at the end of the line to skip all hrefs on it:

```tsx
<a href="/legacy-path">Old page</a> {/* link-ignore */}
{ href: 'https://docs.kblabs.ru/wip' } // link-ignore
```

## Route discovery

Routes are auto-discovered from `app/[locale]/*/page.tsx`. Rules:
- `[slug]` → accepts any single path segment
- `[[...slug]]` / `[...rest]` → accepts any sub-path (unless the page calls `notFound()` with no content, in which case it is excluded — this is the catch-all 404)
- Adding a new `page.tsx` → the checker picks it up automatically on the next run

## Fixing broken internal links

When you see `BROKEN_INTERNAL` for `/solutions/gateway`:

1. Check if a route exists with a different path (e.g. `/product/gateway`) — fix the href.
2. Or create the missing page: `app/[locale]/solutions/gateway/page.tsx`.

**Never add a route to a suppression list to silence the error** — fix the source.

## Fixing broken external links (docs.kblabs.ru)

When `docs.kblabs.ru/some-page` returns 404:

1. Create the missing docs page in `sites/web/apps/docs/`.
2. Or change the href to point to an existing docs URL.
3. Or suppress with `// link-ignore` if the page is intentionally WIP.

## Adding new controlled origins

Edit the `CROSS_DOMAIN_ORIGINS` set near the top of `check-links.mjs`:

```js
const CROSS_DOMAIN_ORIGINS = new Set([
  'kblabs.ru',
  'docs.kblabs.ru',
  'status.kblabs.ru',
  'your-new-domain.com', // add here
]);
```

## Known current issues (as of 2026-05-24)

Run `pnpm --filter @kb-labs/web-site check:links` to see the current list.  
At script creation, found:
- `SiteFooter.tsx` — 3 wrong internal paths (`/solutions/gateway`, `/kb-dev`, `/marketplace`)
- Docs pages for several solution pages don't exist yet (state-broker, mind, quality, kb-devkit, observability, platform-api, release)
- `status.kblabs.ru` — not responding (not yet deployed)
