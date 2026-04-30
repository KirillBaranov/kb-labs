## Summary
Dark mode infrastructure (CSS variables, `KBConfigProvider`, `useKBTheme` hook, Tailwind `darkMode: 'class'`) is already scaffolded in the Studio codebase. The remaining work is completing the dark theme token values, wiring the `KBThemeToggle` component into the header, and ensuring all component CSS modules respond to the `.dark` class on `<html>`.

## Root cause / context
The theming system was set up with the right architecture but left incomplete:
- `studio/app/src/styles/variables.css` has a `.dark {}` selector block, but dark token values need to be filled in (or verified they reference correct colours).
- `studio/ui-core/src/themes/dark.ts` defines semantic dark tokens in TypeScript but those values are not yet generated into the CSS file.
- `KBThemeToggle` exists in `kb-header.tsx` but may not be rendering (the component itself may be missing or not connected to context).
- `KBConfigProvider` already handles `localStorage` key `'studio-ui-theme'` — persistence is ready.

## Implementation steps

1. **Verify/complete dark token values — `studio/ui-core/src/themes/dark.ts`**
   Check that every semantic colour (`bg-primary`, `bg-secondary`, `text-primary`, `text-secondary`, `link`, `success`, `warning`, `error`, `info`, `border-primary`, shadows) has a proper dark-mode value. Fill in any stubs using the neutral/palette tokens from `studio/ui-core/src/tokens/colors.ts`.

2. **Generate dark CSS variables — `studio/app/src/styles/variables.css`**
   Use `generateThemeCSS()` from `studio/ui-core/src/utils/css-vars.ts` (or populate manually) so the `.dark` block contains all CSS custom properties:
   ```css
   .dark {
     --bg-primary: #0f172a;
     --bg-secondary: #1e293b;
     --text-primary: #f1f5f9;
     /* … all other tokens … */
   }
   ```
   Make sure every variable defined in `:root` has a corresponding override in `.dark`.

3. **Implement `KBThemeToggle` component (if missing) — `studio/app/src/components/ui/kb-theme-toggle.tsx`**
   Create or verify the component:
   ```tsx
   import { useKBTheme } from '@/providers/kb-config-provider';
   export function KBThemeToggle() {
     const { theme, setTheme } = useKBTheme();
     const next = theme === 'dark' ? 'light' : 'dark';
     return (
       <button aria-label={`Switch to ${next} mode`} onClick={() => setTheme(next)}>
         {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
       </button>
     );
   }
   ```
   Use icons already available in the project (Ant Design `SunOutlined`/`MoonOutlined` or Lucide equivalents used elsewhere).

4. **Wire toggle into header — `studio/app/src/components/ui/kb-header.tsx`**
   Confirm `<KBThemeToggle />` is imported and rendered in the actions section (right side of the nav bar, before the user profile dropdown). If it's already in the JSX but conditionally hidden, make it always visible.

5. **Verify `KBConfigProvider` applies class — `studio/app/src/providers/kb-config-provider.tsx`**
   Confirm the `useLayoutEffect` in `KBConfigProvider`:
   - Reads `localStorage.getItem('studio-ui-theme')` on init.
   - Adds/removes `.dark` class on `document.documentElement`.
   - Saves to `localStorage` on every `setTheme()` call.
   - Handles `'auto'` by checking `window.matchMedia('(prefers-color-scheme: dark)')`.
   No code changes needed if all four points are confirmed; fix any gaps found.

6. **Ant Design dark theme tokens — `studio/app/src/components/ui/theme-adapter.ts`**
   When `.dark` is active, Ant Design components need the dark algorithm. In `App.tsx`, change the `ConfigProvider` setup to:
   ```tsx
   import { theme as antTheme } from 'antd';
   const { resolvedTheme } = useKBTheme(); // 'light' | 'dark' (auto resolved)
   <ConfigProvider theme={{
     algorithm: resolvedTheme === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
     token: themeAdapter,
   }}>
   ```
   Add a `resolvedTheme` export to `kb-config-provider.tsx` that resolves `'auto'` to the actual current mode.

7. **Audit component CSS modules**
   Search for any hardcoded colour values (hex or `rgb()`) in `*.module.css` files under `studio/app/src/` and replace them with the appropriate CSS variable. Run:
   ```bash
   grep -r '#[0-9a-fA-F]\{3,6\}\|rgb(' studio/app/src --include='*.module.css'
   ```
   Each hardcoded colour is a potential dark-mode gap.

8. **`antd-overrides.css` — `studio/app/src/styles/antd-overrides.css`**
   Add `.dark` scoped overrides for any Ant Design components whose backgrounds or borders don't flip automatically (e.g., dropdown menus, modals, tooltips). Use CSS variables already defined.

## Tests / verification

- Start Studio dev server (`kb-dev start` or `pnpm --filter @kb-labs/studio dev`).
- Open the app; confirm a sun/moon toggle button is visible in the top navigation bar.
- Click the toggle — the entire UI must switch to dark mode without page reload; backgrounds, text, borders, sidebar, all pages, modals, and dropdowns must all be dark.
- Reload the page — dark mode must persist (check `localStorage.getItem('studio-ui-theme')` === `'dark'` in DevTools).
- Click toggle again — must return to light mode; reload and confirm light persists.
- Set OS preference to dark and set Studio to `'auto'` mode (if exposed) — confirm it follows the system.
- Run `pnpm --filter @kb-labs/studio type-check` and `pnpm check` — must pass with no new errors.
