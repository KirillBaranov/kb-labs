# SEO Visual Check

Visual verification of all OG cards for the KB Labs marketing site. Run this before any release to confirm every opengraph-image.tsx renders correctly.

## When to use

- Before a major release or launch
- After adding new pages
- After changing `packages/og` templates or fonts

## What to check on each card

1. **Title** — visible, not cut off, correct page title
2. **Description** — visible, not overflowing
3. **Badge** — visible and correct if expected (Product / Solutions / Blog / etc.)
4. **Layout** — no broken alignment, gradient/background renders
5. **Locale** — EN and RU versions both render correctly

## Procedure

**Step 1: Start the dev server**

Check if it's already running. If not:
```bash
cd sites/web && pnpm dev
```
Wait until Next.js reports ready (usually port 3000).

**Step 2: Get the list of all imageSegment paths**

Run:
```bash
grep -r "imageSegment:" sites/web/apps/web/app/\[locale\]/ --include="page.tsx" | grep -v "'default'" | grep -oP "imageSegment: '\K[^']+"| sort -u
```

**Step 3: Screenshot each OG image**

For each segment in the list, open both locale variants:
- `http://localhost:3000/en/<segment>/opengraph-image`
- `http://localhost:3000/ru/<segment>/opengraph-image`

Use browser tools to screenshot and inspect.

**Step 4: Report**

For each card report:
- ✅ renders correctly
- ⚠️ minor issue (describe)
- ❌ broken (describe — missing text, 404, layout broken)

## Known intentional deviations

- `blog/opengraph-image.tsx` — uses `blog.hero.title` / `blog.hero.subtitle` (not meta keys) by design for richer visual. Suppressed in seo-check with `// seo-ignore og-keys`.
- `product/marketplace/opengraph-image.tsx` — uses `marketplace.hero.*` + `eyebrow` for richer card. Same suppression.
- All `imageSegment: 'default'` pages (demo, signup, legal/*) — share the home page OG image intentionally (not indexed pages).
