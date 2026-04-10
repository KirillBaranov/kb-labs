# KB Labs Studio UI Kit - Component Plan

## 🎯 Goal
Create a unified UI Kit using design tokens from `@kb-labs/studio-ui-core` and Ant Design theme tokens.

**Critical Requirements:**
- ✅ NO hardcoded colors (no `#DC2626`, `rgb()`, etc.)
- ✅ Use ONLY Ant Design tokens via `theme.useToken()`
- ✅ Use design tokens from `@kb-labs/studio-ui-core` for spacing/typography
- ✅ NO inline styles in widget components

## 📊 Current Analysis

### Inline Styles Usage
- **Total inline styles found**: 98 instances
- **Most common patterns**:
  - Font sizes: `fontSize: '0.85em'`, `fontSize: '1.5rem'`
  - Colors: `color: 'var(--text-secondary)'`, `color: 'var(--error-color)'`
  - Spacing: `marginBottom: 16`, `padding: '12px 16px'`
  - Font weights: `fontWeight: 700`

### Most Used Ant Design Components
Based on current widget implementation:

1. **Typography** - Text, Title, Paragraph (used in ~10 places)
2. **Space** - Spacing layout (used in ~10 places)
3. **Button** - Actions (used in ~7 places)
4. **Card** - Container (used in ~6 places)
5. **Tag** - Labels/badges (used in ~5 places)
6. **Badge** - Status indicators (used in ~4 places)
7. **Form** - Form elements (used in ~4 places)
8. **Typography.Text** - Inline text (used in ~4 places)

## 🏗️ UI Kit Component Hierarchy

### Tier 1: Primitives (Foundation)
**Status: ✅ Complete**

These are the building blocks - lowest level components.

- ✅ **Text** - Typography primitive with semantic colors
  - Sizes: xs, sm, base, lg, xl, 2xl
  - Weights: normal, medium, semibold, bold
  - Colors: primary, secondary, success, warning, error, info
  - Uses: `typography.fontSize`, `typography.fontWeight`, `token.colorText`

- ✅ **Box** - Layout primitive with spacing
  - Props: p, pt, pr, pb, pl, m, mt, mr, mb, ml
  - Uses: `spacing` tokens from `@kb-labs/studio-ui-core`

- ✅ **Flex** - Flexbox layout primitive
  - Props: direction, justify, align, gap, wrap
  - Uses: `spacing` tokens for gap

### Tier 2: Basic Components
**Status: 🔄 In Progress**

Built on primitives, add semantic meaning.

- ✅ **MetricCard** - Metric display with trend
  - Uses: Text, Flex, Box, Ant Card
  - Status: Complete, used in Metric and MetricGroup widgets

- 🔄 **Badge** - Status indicator
  - Variants: success, warning, error, info, default
  - Uses: Ant Badge with token colors
  - Status: Created, needs export and usage

- ⏳ **Tag** - Label/category indicator (NEXT)
  - Variants: success, warning, error, info, default, neutral
  - Uses: Ant Tag with token colors
  - Usage: Card widget (4 instances), Timeline (2 instances)

- ⏳ **Button** - Action button (NEXT)
  - Variants: primary, default, text, link, danger
  - Sizes: small, default, large
  - Uses: Ant Button with consistent styling
  - Usage: Alert, Confirm, ErrorState, Form (~7 instances)

- ⏳ **Stack** - Vertical/horizontal spacing layout
  - Props: direction, spacing, align
  - Uses: Box/Flex with consistent gap tokens
  - Usage: Multiple widgets for consistent spacing

### Tier 3: Complex Components
**Status: ⏳ Not Started**

Domain-specific components built from Tier 1 + 2.

- ⏳ **CardContent** - Enhanced card with header/footer/sections
  - Uses: Box, Text, Tag, Badge, Ant Card
  - Usage: Card widget (6 inline styles)

- ⏳ **TimelineItem** - Timeline entry with status
  - Uses: Badge, Text, Stack
  - Usage: Timeline widget (6 inline styles)

- ⏳ **LogEntry** - Log line with level badge
  - Uses: Badge, Text, Flex
  - Usage: Logs widget (7 inline styles)

- ⏳ **JsonView** - JSON display with syntax highlighting
  - Uses: Box, Text
  - Usage: Json widget (8 inline styles)

## 📋 Implementation Plan

### Phase 1: Complete Basic Components (Current Phase)
**Goal**: Build foundation layer of reusable components

#### Step 1.1: Export Badge ✅
- [x] Badge.tsx created
- [ ] Add to ui/index.ts
- [ ] Test in isolation

#### Step 1.2: Create Tag Component
```typescript
// apps/studio/src/ui/Tag.tsx
export type TagVariant = 'success' | 'warning' | 'error' | 'info' | 'default' | 'neutral';

export function Tag({ variant, children, closable, onClose }: TagProps) {
  const { token } = useToken();

  const colorMap: Record<TagVariant, string> = {
    success: token.colorSuccess,
    warning: token.colorWarning,
    error: token.colorError,
    info: token.colorInfo,
    default: token.colorPrimary,
    neutral: token.colorTextSecondary,
  };

  return <AntTag color={colorMap[variant]} closable={closable} onClose={onClose}>{children}</AntTag>;
}
```

#### Step 1.3: Create Button Component
```typescript
// apps/studio/src/ui/Button.tsx
export type ButtonVariant = 'primary' | 'default' | 'text' | 'link' | 'danger';
export type ButtonSize = 'small' | 'default' | 'large';

export function Button({ variant, size, children, icon, loading, disabled, onClick }: ButtonProps) {
  return (
    <AntButton
      type={variantMap[variant]}
      size={size}
      icon={icon}
      loading={loading}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </AntButton>
  );
}
```

#### Step 1.4: Create Stack Component
```typescript
// apps/studio/src/ui/Stack.tsx
export type StackDirection = 'vertical' | 'horizontal';
export type StackSpacing = SpacingValue;

export function Stack({ direction = 'vertical', spacing = 2, align, children }: StackProps) {
  return (
    <Flex
      direction={direction === 'vertical' ? 'column' : 'row'}
      gap={spacing}
      align={align}
    >
      {children}
    </Flex>
  );
}
```

### Phase 2: Migrate High-Priority Widgets
**Goal**: Eliminate most inline styles by migrating top offenders

Priority order by inline style count:

1. **Json** (8 styles) - needs JsonView component
2. **Logs** (7 styles) - needs LogEntry component
3. **Timeline** (6 styles) - needs TimelineItem component
4. **Card** (6 styles) - needs CardContent component or direct Tag/Badge usage
5. **MetricGroup** ✅ (5 styles) - DONE
6. **Metric** ✅ (5 styles) - DONE

### Phase 3: Create Complex Components
**Goal**: Domain-specific components for remaining widgets

#### CardContent Component
```typescript
// apps/studio/src/ui/CardContent.tsx
export interface CardContentProps {
  title?: string;
  subtitle?: string;
  tags?: { label: string; variant: TagVariant }[];
  badges?: { label: string; variant: BadgeVariant }[];
  extra?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function CardContent({ title, subtitle, tags, badges, extra, footer, children }: CardContentProps) {
  // Uses: Box, Text, Tag, Badge, Stack
}
```

#### TimelineItem Component
```typescript
// apps/studio/src/ui/TimelineItem.tsx
export interface TimelineItemProps {
  timestamp: string;
  title: string;
  description?: string;
  status?: 'success' | 'warning' | 'error' | 'info';
  icon?: React.ReactNode;
}

export function TimelineItem({ timestamp, title, description, status, icon }: TimelineItemProps) {
  // Uses: Badge, Text, Stack, Flex
}
```

### Phase 4: Complete Migration
**Goal**: Eliminate ALL inline styles from widget components

Remaining widgets (~20 widgets) with <5 inline styles each.

## 🎨 Design Token Usage

### Colors (from Ant Design theme.useToken())
```typescript
const { token } = useToken();

// Semantic colors
token.colorPrimary      // Primary brand color
token.colorSuccess      // Success/positive
token.colorWarning      // Warning/caution
token.colorError        // Error/danger
token.colorInfo         // Info/neutral

// Text colors
token.colorText         // Primary text
token.colorTextSecondary // Secondary text
token.colorTextDisabled  // Disabled text

// Background colors
token.colorBgContainer   // Container background
token.colorBgElevated    // Elevated background
token.colorBorder        // Border color
```

### Spacing (from @kb-labs/studio-ui-core)
```typescript
import { spacing } from '@kb-labs/studio-ui-core';

spacing[0]  // 0
spacing[1]  // 0.25rem
spacing[2]  // 0.5rem
spacing[3]  // 0.75rem
spacing[4]  // 1rem
spacing[6]  // 1.5rem
spacing[8]  // 2rem
```

### Typography (from @kb-labs/studio-ui-core)
```typescript
import { typography } from '@kb-labs/studio-ui-core';

typography.fontSize.xs    // ['0.75rem', { lineHeight: '1rem' }]
typography.fontSize.sm    // ['0.875rem', { lineHeight: '1.25rem' }]
typography.fontSize.base  // ['1rem', { lineHeight: '1.5rem' }]
typography.fontSize.lg    // ['1.125rem', { lineHeight: '1.75rem' }]
typography.fontSize.xl    // ['1.25rem', { lineHeight: '1.75rem' }]
typography.fontSize['2xl'] // ['1.5rem', { lineHeight: '2rem' }]

typography.fontWeight.normal   // 400
typography.fontWeight.medium   // 500
typography.fontWeight.semibold // 600
typography.fontWeight.bold     // 700
```

## ✅ Success Criteria

### Component Quality
- [ ] All components use ONLY design tokens (no hardcoded values)
- [ ] All components have proper TypeScript types
- [ ] All components are documented with examples
- [ ] All components are exported from ui/index.ts

### Widget Migration
- [ ] Zero inline styles in widget components
- [ ] All colors use Ant Design tokens
- [ ] All spacing uses spacing tokens
- [ ] All typography uses typography tokens

### Code Quality
- [ ] Build passes without errors
- [ ] Type check passes
- [ ] Lint passes
- [ ] No CSS variables (var(--*)) - use tokens instead

## 📝 Notes

### DO ✅
- Use `theme.useToken()` for ALL colors
- Use `spacing` tokens for ALL margins/paddings/gaps
- Use `typography` tokens for ALL font sizes/weights
- Build components incrementally (primitives → basic → complex)
- Test each component in isolation before using in widgets

### DON'T ❌
- Hardcode colors like `#DC2626` or `rgb(220, 38, 38)`
- Use CSS variables like `var(--success)` or `var(--text-secondary)`
- Use magic numbers for spacing (`marginBottom: 16`)
- Use string literals for font sizes (`fontSize: '1.5rem'`)
- Skip token usage in favor of inline styles

---

**Created**: 2026-01-27
**Status**: Phase 1 in progress
**Next Step**: Export Badge, create Tag component
