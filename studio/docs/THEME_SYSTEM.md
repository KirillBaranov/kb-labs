# Theme System Architecture

## Current Architecture (2026-04-02)

### 1. CSS Variables Layer (`apps/studio/src/styles/variables.css`)
**Source of truth** для всех цветов. Определяет design tokens через CSS custom properties.

```css
:root {
  /* Light theme */
  --bg-primary: #EEF0F3;   /* page background (updated 2026-04) */
  --bg-secondary: #FFFFFF;
  --bg-sidebar: #FFFFFF;   /* sidebar bg (added 2026-04) */
  --text-primary: #111827;
  --border-primary: #E5E7EB;
  --link: #0c66ff;          /* primary blue accent (added 2026-04) */
  --font-body: 'Inter', system-ui, sans-serif;     /* added 2026-04 */
  --font-heading: 'Plus Jakarta Sans', sans-serif; /* added 2026-04 */
}

.dark {
  /* Dark theme overrides */
  --bg-primary: #0D0D0F;
  --bg-sidebar: #1A1A1C;   /* dark sidebar */
  --text-primary: #F5F5F7;
  --border-primary: #3F3F46;
}
```

**Ключевые токены (2026-04):**

| Токен | Назначение |
|-------|------------|
| `--bg-primary` | Фон страницы (`#EEF0F3`) |
| `--bg-secondary` | Фон карточек и контейнеров (`#FFFFFF`) |
| `--bg-sidebar` | Фон сайдбара (отдельный от bg-primary!) |
| `--link` | Синий акцент (`#0c66ff`) |
| `--font-body` | Inter — основной шрифт |
| `--font-heading` | Plus Jakarta Sans — заголовки и числа |

**Важно:** `--bg-sidebar` отличается от `--bg-primary` намеренно — это визуальное разделение сайдбара и контента страницы.

**Преимущества:**
- ✅ Single source of truth
- ✅ Автоматическое переключение тем через CSS классы
- ✅ Работает без JavaScript
- ✅ Можно добавлять новые темы (например, `.sepia`, `.high-contrast`)

---

### 1a. Typography Layer (`index.html` + `src/styles/base.css`)

Шрифты загружаются через Google Fonts в `index.html`:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
```

`base.css` применяет шрифты глобально:
```css
body { font-family: var(--font-body); }
h1, h2, h3, h4, h5, h6 { font-family: var(--font-heading); }
```

Компоненты используют `fontFamily: 'var(--font-heading)'` для числовых значений (KPI, цены, метрики).

---

### 2. Theme Adapter Layer (`apps/studio/src/components/ui/theme-adapter.ts`)
Мост между CSS variables и Ant Design theme system.

**Функции:**
- `getAntDesignTokens()` - маппит ~100 Ant Design токенов на CSS variables
- `getAntDesignComponents()` - компонент-специфичные настройки (50+ компонентов)
- `getThemeAlgorithm()` - отключен, CSS variables управляют темами

**Пример маппинга:**
```typescript
export function getAntDesignTokens(): ThemeConfig['token'] {
  return {
    // Backgrounds
    colorBgContainer: 'var(--bg-secondary, #FFFFFF)',
    colorBgBase: 'var(--bg-primary, #F9FAFB)',

    // Text
    colorText: 'var(--text-primary, #111827)',
    colorTextSecondary: 'var(--text-secondary, #6B7280)',

    // Borders
    colorBorder: 'var(--border-primary, #E5E7EB)',

    // Status
    colorSuccess: 'var(--success, #16A34A)',
    colorError: 'var(--error, #DC2626)',
    // ...
  };
}

export function getAntDesignComponents(): ThemeConfig['components'] {
  return {
    Card: {
      colorBorder: 'var(--border-primary)',
      colorBgContainer: 'var(--bg-secondary)',
    },
    Button: {
      colorPrimary: 'var(--link)',
      defaultHoverBg: 'var(--bg-hover)',
    },
    // ... 50+ components
  };
}
```

**Важно:** Все токены используют `var()` с fallback значениями, чтобы работать в SSR.

---

### 3. Config Provider Layer (`packages/studio-ui-react/src/components/kb-config-provider.tsx`)
React context для управления темой в runtime.

**API:**
```typescript
interface KBConfigProviderProps {
  defaultTheme?: 'light' | 'dark' | 'auto';
  storageKey?: string;
  children: React.ReactNode;
}

function useKBTheme(): {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}
```

**Что делает:**
1. Управляет переключением light/dark/auto
2. Применяет CSS класс на `<html>` (`.light` или `.dark`)
3. Сохраняет выбор в `localStorage`
4. Показывает плавную анимацию при переключении
5. Передаёт theme config в Ant Design `ConfigProvider`

**Использование:**
```tsx
// App.tsx
<KBConfigProvider defaultTheme="auto">
  <YourApp />
</KBConfigProvider>

// Anywhere in app
function ThemeToggle() {
  const { theme, setTheme } = useKBTheme();
  return (
    <Button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      Toggle Theme
    </Button>
  );
}
```

---

### 4. Global Styles Layer (`apps/studio/src/styles/antd-overrides.css` + `base.css`)
Глобальные стили и Ant Design фиксы.

> **Note (2026-04):** `theme.css` удалён. Функции разделены на `base.css` (базовый reset) и `antd-overrides.css` (Ant Design normalization).

**Содержит:**
- Базовые элементы (body, headings, links)
- Utility классы (`.text-primary`, `.bg-theme-secondary`)
- Spacing system (`--spacing-page`, `--spacing-section`)
- Typography system (`--typo-page-title-size`)
- Ant Design overrides через `!important`

**Проблемы:**
- ❌ Слишком много `!important` (17 мест)
- ❌ Дублирование стилей между theme-adapter и theme.css
- ❌ Нет типизации для CSS variables
- ❌ Ant Design overrides могут ломаться при обновлении библиотеки

---

## Recommendations for Improvement

### Phase 1: Clean Up Theme Adapter ✅ (Done)

**Problem:** Некоторые компоненты не имеют полных настроек в `getAntDesignComponents()`.

**Solution:** Добавлять недостающие токены по мере обнаружения проблем.

**Example:** Card компонент не имел `colorBorder` → добавили.

---

### Phase 2: Typed CSS Variables

**Problem:** CSS variables не типизированы, легко сделать опечатку.

**Solution:** Создать TypeScript types для CSS variables.

**Implementation:**
```typescript
// packages/studio-ui-kit/src/styles/theme-tokens.ts

export type ThemeToken =
  // Backgrounds
  | '--bg-primary'
  | '--bg-secondary'
  | '--bg-tertiary'
  | '--bg-hover'
  // Text
  | '--text-primary'
  | '--text-secondary'
  | '--text-tertiary'
  | '--text-inverse'
  // Borders
  | '--border-primary'
  | '--border-secondary'
  // Status
  | '--success'
  | '--warning'
  | '--error'
  | '--info'
  // Interactive
  | '--link'
  | '--link-hover'
  | '--accent-subtle'
  // States
  | '--disabled'
  // Effects
  | '--shadow'
  | '--shadow-hover'
  | '--shadow-elevated';

export type ThemeVariables = Record<ThemeToken, string>;

// Helper function with type safety
export function cssVar(token: ThemeToken, fallback?: string): string {
  return fallback ? `var(${token}, ${fallback})` : `var(${token})`;
}

// Usage:
const color = cssVar('--text-primary', '#111827');
```

**Benefits:**
- ✅ Autocomplete в IDE
- ✅ Compile-time проверка токенов
- ✅ Рефакторинг с уверенностью

---

### Phase 3: Component Theme Overrides

**Problem:** Некоторые компоненты нуждаются в специфичных стилях, которые не покрываются токенами.

**Solution:** Создать систему component theme overrides.

**Implementation:**
```typescript
// packages/studio-ui-kit/src/components/Card/Card.theme.ts

import type { CardProps } from 'antd';

export const cardThemeOverrides = {
  light: {
    boxShadow: '0 1px 3px var(--shadow)',
    hoverBoxShadow: '0 2px 8px var(--shadow-hover)',
  },
  dark: {
    boxShadow: '0 1px 3px var(--shadow), 0 0 0 1px var(--shadow-elevated)',
    hoverBoxShadow: '0 2px 8px var(--shadow-hover), 0 0 0 1px var(--shadow-elevated)',
  },
};

// Apply in component
<Card style={{ boxShadow: cardThemeOverrides[theme].boxShadow }} />
```

---

### Phase 4: Remove `!important` from theme.css

**Problem:** 17 мест используют `!important` для override Ant Design стилей.

**Solution:** Использовать Ant Design `components` API вместо CSS overrides.

**Strategy:**
1. Найти все `!important` в theme.css
2. Перенести стили в `getAntDesignComponents()`
3. Использовать специфичность селекторов вместо `!important`

**Example:**
```css
/* ❌ Before: CSS override */
.ant-menu-item-selected {
  background-color: var(--accent-subtle) !important;
}

/* ✅ After: Theme adapter */
Menu: {
  itemSelectedBg: 'var(--accent-subtle)',
}
```

---

### Phase 5: Theme Presets System

**Problem:** Пользователи могут хотеть больше тем, чем light/dark.

**Solution:** Создать систему theme presets.

**Implementation:**
```typescript
// packages/studio-ui-react/src/lib/theme-presets.ts

export interface ThemePreset {
  id: string;
  name: string;
  variables: Partial<ThemeVariables>;
}

export const themePresets: Record<string, ThemePreset> = {
  light: {
    id: 'light',
    name: 'Light',
    variables: {
      '--bg-primary': '#F9FAFB',
      '--text-primary': '#111827',
      // ...
    },
  },
  dark: {
    id: 'dark',
    name: 'Dark',
    variables: {
      '--bg-primary': '#0D0D0F',
      '--text-primary': '#F5F5F7',
      // ...
    },
  },
  sepia: {
    id: 'sepia',
    name: 'Sepia',
    variables: {
      '--bg-primary': '#F4ECD8',
      '--text-primary': '#5B4636',
      // ...
    },
  },
  highContrast: {
    id: 'high-contrast',
    name: 'High Contrast',
    variables: {
      '--bg-primary': '#000000',
      '--text-primary': '#FFFFFF',
      '--border-primary': '#FFFFFF',
      // ...
    },
  },
};

// Apply preset
function applyThemePreset(presetId: string) {
  const preset = themePresets[presetId];
  const root = document.documentElement;

  Object.entries(preset.variables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}
```

**UI:**
```tsx
<Select
  value={currentTheme}
  onChange={setTheme}
  options={[
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
    { label: 'Sepia', value: 'sepia' },
    { label: 'High Contrast', value: 'high-contrast' },
  ]}
/>
```

---

### Phase 6: Theme Builder UI

**Problem:** Дизайнеры хотят кастомизировать темы без изменения кода.

**Solution:** Создать Theme Builder interface.

**Features:**
- Visual color picker для всех токенов
- Real-time preview
- Export в CSS/JSON/TypeScript
- Import существующих тем
- Share theme via URL

**Example UI:**
```
┌─────────────────────────────────────────┐
│ Theme Builder                           │
├─────────────────────────────────────────┤
│ Backgrounds                             │
│  Primary     [#F9FAFB] 🎨              │
│  Secondary   [#FFFFFF] 🎨              │
│  Tertiary    [#F3F4F6] 🎨              │
│                                         │
│ Text                                    │
│  Primary     [#111827] 🎨              │
│  Secondary   [#6B7280] 🎨              │
│                                         │
│ [Export CSS] [Export JSON] [Share 🔗]  │
└─────────────────────────────────────────┘
```

---

## Migration Path

### Current Status: Phase 1 ✅ Complete
- Theme adapter properly maps all Ant Design tokens
- Card component border fixed
- System working end-to-end

### Next Steps:

**Quick Wins (1-2 days):**
1. ✅ Fix remaining missing component tokens (as discovered)
2. 📝 Document theme tokens in code comments
3. 🧪 Test theme switching in all pages

**Medium Term (1 week):**
1. 🔧 Create typed CSS variables
2. 🎨 Remove `!important` from theme.css
3. 📦 Move component overrides to theme-adapter

**Long Term (2-4 weeks):**
1. 🎨 Implement theme presets system
2. 🛠️ Build theme builder UI
3. 📚 Create theme documentation site

---

## Current Theme Tokens Reference

### Backgrounds
- `--bg-primary` - Main page background
- `--bg-secondary` - Card/container background
- `--bg-tertiary` - Subtle background (table headers)
- `--bg-hover` - Hover state background

### Text
- `--text-primary` - Main text color
- `--text-secondary` - Secondary text (labels)
- `--text-tertiary` - Tertiary text (captions)
- `--text-inverse` - Text on colored backgrounds

### Borders
- `--border-primary` - Default border color
- `--border-secondary` - Hover/active border color

### Status
- `--success` - Success state (#16A34A light, #22C55E dark)
- `--warning` - Warning state (#F59E0B light, #EAB308 dark)
- `--error` - Error state (#DC2626 light, #EF4444 dark)
- `--info` - Info state (#0EA5E9 light, #38BDF8 dark)

### Interactive
- `--link` - Link color
- `--link-hover` - Link hover color
- `--accent-subtle` - Subtle accent background

### States
- `--disabled` - Disabled element color

### Effects
- `--shadow` - Base shadow
- `--shadow-hover` - Hover shadow
- `--shadow-elevated` - Elevated card shadow

---

## Best Practices

### DO ✅
- Use CSS variables everywhere (`var(--text-primary)`)
- Add fallback values in theme-adapter (`var(--text-primary, #111827)`)
- Test in both light and dark themes
- Use `getAntDesignComponents()` for component-specific styles
- Document custom tokens in code comments

### DON'T ❌
- Use hardcoded hex colors
- Use `!important` for Ant Design overrides (use theme API)
- Use `token.colorXXX` in inline styles (use CSS variables)
- Skip fallback values in theme-adapter (breaks SSR)
- Forget to test theme switching

---

## Troubleshooting

### Colors not updating in dark theme?
**Check:**
1. Is the color using CSS variable? (`var(--xxx)`)
2. Is `.dark` class applied to `<html>`?
3. Is the variable defined in `.dark` section of variables.css?
4. Is the component using inline styles with `token.colorXXX`? (use CSS var instead)

### Ant Design component has wrong colors?
**Check:**
1. Is the component configured in `getAntDesignComponents()`?
2. Are the correct tokens mapped? (e.g., `colorBorder` not just `colorBorderSecondary`)
3. Is there a CSS override with `!important`? (should be removed)

### Theme not persisting after refresh?
**Check:**
1. Is `storageKey` set in `KBConfigProvider`?
2. Is localStorage available? (check browser privacy settings)
3. Is theme value being read from `localStorage.getItem()`?

---

**Last Updated:** 2026-04-02
**Theme System Version:** 1.1
**Status:** Production Ready ✅
