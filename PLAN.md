## Summary

Dark mode infrastructure is already fully implemented in the Studio codebase — CSS variables, localStorage persistence, theme toggle, and header wiring all exist. The implementation plan is to verify the complete working state and close any remaining gaps.

---

## Summary

`KBConfigProvider` + `KBThemeToggle` + CSS variable overrides are already in place. The work is to audit the full surface area for correctness, add a missing `system-preference` change listener, and write verification tests.

## Root cause / context

The feature is structurally complete:

- **CSS variables** — `studio/app/src/styles/variables.css` defines `:root` (light) and `.dark { … }` with full background/text/border overrides.
- **`KBConfigProvider`** — `studio/app/src/components/ui/kb-config-provider.tsx` reads `localStorage.getItem('studio-ui-theme')`, applies `.dark` / `.light` on `document.documentElement` via `useLayoutEffect`, and persists changes. Supports `'light' | 'dark' | 'auto'`.
- **Ant Design tokens** — `studio/hooks/src/theme-adapter.ts:getAntDesignTokens()` returns CSS-variable references (`var(--bg-secondary)` etc.) so antd components inherit the active `.dark` values automatically. `darkAlgorithm` is intentionally **not** used — it would double-invert the already-switched CSS vars.
- **Toggle** — `studio/app/src/components/ui/kb-theme-toggle.tsx` renders a three-option Dropdown (Light / Dark / Auto) calling `useKBTheme().setTheme()`.
- **Header** — `studio/app/src/components/ui/kb-header.tsx:97` already renders `<KBThemeToggle />`.
- **Tailwind** — `studio/app/tailwind.config.ts` sets `darkMode: 'class'`.

One gap: `'auto'` mode resolves system preference once on mount but does **not** re-evaluate if the OS preference changes at runtime.

## Implementation steps

1. **Add OS-preference change listener** — `studio/app/src/components/ui/kb-config-provider.tsx`

   Inside `KBConfigProvider`, subscribe to `window.matchMedia('(prefers-color-scheme: dark)')` changes when `theme === 'auto'` and re-run `useLayoutEffect` to re-apply the correct class. Add a `useEffect` that attaches/detaches the listener whenever `theme` changes:

   ```ts
   React.useEffect(() => {
     if (theme !== 'auto') return;
     const mq = window.matchMedia('(prefers-color-scheme: dark)');
     const handler = () => {
       const root = document.documentElement;
       root.classList.remove('light', 'dark');
       root.classList.add(mq.matches ? 'dark' : 'light');
       root.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
     };
     mq.addEventListener('change', handler);
     return () => mq.removeEventListener('change', handler);
   }, [theme]);
   ```

2. **Expose `useKBTheme` from the public hooks package** — `studio/hooks/src/index.ts`

   Re-export `useKBTheme` and `ThemeMode` so plugin pages can read the active theme without importing from `studio/app` internals.

3. **Verify `getAntDesignComponents` dark coverage** — `studio/hooks/src/theme-adapter.ts:216+`

   Audit the `getAntDesignComponents()` function. Any component that hardcodes hex colors (not `var()` references) needs updating to use the appropriate CSS variable. Key suspects: `Table`, `Popover`, `Tooltip`, `Modal`, `Select`.

4. **Smoke test all route-level pages** — manually or via Playwright

   Open each module route (`/`, `/plugins`, `/analytics`, `/observability`, `/settings`) and toggle to dark. Confirm no visually broken components (white boxes on dark backgrounds = a hardcoded color).

5. **`<ThemeTransitionOverlay>` correctness** — `studio/app/src/components/ui/theme-transition-overlay.tsx`

   Confirm the overlay renders with the correct background for the *incoming* theme (dark slide should be dark-colored, not white), so the transition doesn't flash the wrong color mid-animation.

## Tests / verification

**Manual**
1. Open Studio, click the theme toggle in the nav bar → switch to Dark → verify all pages apply dark backgrounds/text.
2. Reload the page → verify dark mode persists (preference read from `localStorage['studio-ui-theme']`).
3. Switch to Auto → change OS appearance → verify the page updates immediately (after step 1 fix).
4. Open DevTools → Application → Local Storage → confirm key `studio-ui-theme` is present.

**Unit tests** — add to `studio/app/src/__tests__/kb-config-provider.test.tsx`:
- Renders with `defaultTheme='dark'`, asserts `document.documentElement.classList.contains('dark')`.
- Calls `setTheme('dark')`, asserts localStorage write.
- On mount, if `localStorage` has `'dark'`, asserts `.dark` class is applied before first paint (`useLayoutEffect`).

**Accessibility**
- Confirm contrast ratios in dark mode meet WCAG AA (`--text-primary` on `--bg-primary` ≥ 4.5:1). Current values: `#F5F5F7` on `#0D0D0F` = ~18:1. ✓
