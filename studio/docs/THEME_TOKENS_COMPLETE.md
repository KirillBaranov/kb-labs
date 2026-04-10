# Complete Ant Design Token Mapping

## Analysis Results

**Total Ant Design tokens:** 180
**Currently mapped:** 150 (83%)
**Missing:** 30 critical tokens

## Missing Critical Color Tokens

These **MUST** be added to `getAntDesignTokens()`:

### 1. Base Colors
```typescript
colorTextBase: 'var(--text-primary, #111827)',
colorBgBase: 'var(--bg-primary, #F9FAFB)',  // Already have this ✅
```

### 2. Hover/Active States
```typescript
colorBgTextHover: 'var(--bg-hover, #F3F4F6)',
colorBgTextActive: 'var(--bg-hover, #F3F4F6)',
colorBgContainerDisabled: 'var(--bg-tertiary, #F3F4F6)',
```

### 3. Content/Fill
```typescript
colorFillContentHover: 'var(--bg-hover, #F3F4F6)',
colorBorderBg: 'var(--bg-secondary, #FFFFFF)',
```

### 4. Outlines
```typescript
colorWarningOutline: 'var(--warning, #F59E0B)',
colorErrorOutline: 'var(--error, #DC2626)',
```

### 5. Highlight
```typescript
colorHighlight: 'var(--link, #2563EB)',
```

### 6. Control States
```typescript
controlOutline: 'rgba(91, 87, 214, 0.2)',  // --link with opacity
controlItemBgActiveDisabled: 'var(--bg-tertiary, #F3F4F6)',
controlTmpOutline: 'rgba(91, 87, 214, 0.1)',
```

## Typography/Layout Tokens

These are already defined but may need verification:

```typescript
// Font sizes - Already have ✅
fontSize: 14,
fontSizeLG: 16,
fontSizeSM: 12,
fontSizeXL: 20,
fontSizeHeading1: 38,
// ... etc

// Line heights - Already have ✅
lineHeight: 1.5714285714285714,
lineHeightLG: 1.5,
// ... etc

// Control heights - Already have ✅
controlHeight: 36,
controlHeightLG: 40,
// ... etc
```

## Component-Specific Tokens

### Card Component

Current mapping:
```typescript
Card: {
  colorText: 'var(--text-primary)',
  colorTextHeading: 'var(--text-primary)',
  colorBorderSecondary: 'var(--border-primary)',
  colorBgContainer: 'var(--bg-secondary)',
  colorBorder: 'var(--border-primary)',  // ✅ Added
}
```

**Complete mapping should include:**
```typescript
Card: {
  // Colors (inherit from global)
  colorText: 'var(--text-primary)',
  colorTextHeading: 'var(--text-primary)',
  colorBgContainer: 'var(--bg-secondary)',
  colorBorder: 'var(--border-primary)',
  colorBorderSecondary: 'var(--border-primary)',

  // Component-specific
  headerBg: 'var(--bg-secondary)',
  headerFontSize: 16,
  headerFontSizeSM: 14,
  headerHeight: 48,
  headerHeightSM: 36,
  bodyPadding: 24,
  bodyPaddingSM: 16,
  headerPadding: 16,
  headerPaddingSM: 12,
  actionsBg: 'var(--bg-tertiary)',
  actionsLiMargin: '12px 0',
  tabsMarginBottom: -17,
  extraColor: 'var(--text-secondary)',
},
```

### Button Component

Current mapping is minimal. **Complete mapping:**
```typescript
Button: {
  // Colors
  colorText: 'var(--text-primary)',
  colorBgContainer: 'var(--bg-secondary)',
  colorBorder: 'var(--border-primary)',
  colorPrimary: 'var(--link)',
  colorPrimaryHover: 'var(--link-hover)',
  colorPrimaryActive: 'var(--link-hover)',
  primaryColor: 'var(--text-inverse)',

  // Hover states
  defaultHoverBg: 'var(--bg-hover)',
  defaultHoverColor: 'var(--text-primary)',
  defaultHoverBorderColor: 'var(--border-secondary)',

  // Text button
  colorTextHover: 'var(--link)',
  colorTextActive: 'var(--link)',
  textHoverBg: 'var(--accent-subtle)',

  // Component-specific
  contentFontSize: 14,
  contentFontSizeLG: 16,
  contentFontSizeSM: 14,
  defaultBg: 'var(--bg-secondary)',
  defaultBorderColor: 'var(--border-primary)',
  defaultColor: 'var(--text-primary)',
  defaultShadow: '0 2px 0 rgba(0, 0, 0, 0.015)',
  primaryShadow: '0 2px 0 rgba(91, 87, 214, 0.1)',
  dangerColor: 'var(--error)',
  dangerShadow: '0 2px 0 rgba(220, 38, 38, 0.1)',
},
```

### Table Component

Current mapping is good but could be more complete:
```typescript
Table: {
  // Current ✅
  headerBg: 'var(--bg-tertiary)',
  headerColor: 'var(--text-primary)',
  rowHoverBg: 'var(--bg-hover)',
  borderColor: 'var(--border-primary)',
  colorText: 'var(--text-primary)',
  colorTextHeading: 'var(--text-primary)',

  // Add these:
  bodySortBg: 'var(--bg-tertiary)',
  rowSelectedBg: 'var(--accent-subtle)',
  rowSelectedHoverBg: 'var(--accent-subtle)',
  rowExpandedBg: 'var(--bg-secondary)',
  footerBg: 'var(--bg-tertiary)',
  footerColor: 'var(--text-primary)',
  filterDropdownBg: 'var(--bg-secondary)',
  filterDropdownMenuBg: 'var(--bg-secondary)',

  // Sizing
  cellPaddingBlock: 16,
  cellPaddingInline: 16,
  cellPaddingBlockMD: 12,
  cellPaddingInlineMD: 8,
  cellPaddingBlockSM: 8,
  cellPaddingInlineSM: 8,
  cellFontSize: 14,
  cellFontSizeMD: 14,
  cellFontSizeSM: 12,

  // Already have ✅
  headerSortActiveBg: 'var(--bg-tertiary)',
  headerSortHoverBg: 'var(--bg-tertiary)',
  headerFilterHoverBg: 'var(--bg-tertiary)',
  colorIcon: 'var(--text-secondary)',
  colorIconHover: 'var(--text-primary)',
  expandIconBg: 'var(--bg-secondary)',
  fixedHeaderSortActiveBg: 'var(--bg-tertiary)',
  selectionColumnWidth: 60,
  stickyScrollBarBg: 'var(--bg-tertiary)',
  stickyScrollBarBorderRadius: 4,
},
```

## Priority Mapping Plan

### Phase 1: Critical Colors (Do This First!)

Add these to `getAntDesignTokens()`:

```typescript
// Add after existing color tokens
colorTextBase: 'var(--text-primary, #111827)',
colorBgTextHover: 'var(--bg-hover, #F3F4F6)',
colorBgTextActive: 'var(--bg-hover, #F3F4F6)',
colorBgContainerDisabled: 'var(--bg-tertiary, #F3F4F6)',
colorFillContentHover: 'var(--bg-hover, #F3F4F6)',
colorBorderBg: 'var(--bg-secondary, #FFFFFF)',
colorWarningOutline: 'var(--warning, #F59E0B)',
colorErrorOutline: 'var(--error, #DC2626)',
colorHighlight: 'var(--link, #2563EB)',
controlOutline: 'rgba(91, 87, 214, 0.2)',
controlItemBgActiveDisabled: 'var(--bg-tertiary, #F3F4F6)',
controlTmpOutline: 'rgba(91, 87, 214, 0.1)',
controlOutlineWidth: 2,
controlInteractiveSize: 16,
```

### Phase 2: Component-Specific Tokens

For each component you use heavily, add complete token mapping:

1. **Card** - Add sizing/spacing tokens (headerHeight, bodyPadding, etc.)
2. **Button** - Add all hover states and shadows
3. **Table** - Add row selection and sorting colors
4. **Input** - Add focus/hover border colors
5. **Select/Dropdown** - Add option hover/selected colors
6. **Menu** - Complete (already done)
7. **Modal/Drawer** - Add backdrop and shadow tokens
8. **Form** - Add label and validation colors
9. **Tabs** - Complete (already done)
10. **Tag** - Complete (already done)

### Phase 3: Optional Enhancements

Typography tokens (can keep defaults or customize):
```typescript
fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial',
fontSize: 14,
fontSizeLG: 16,
fontSizeSM: 12,
// ... etc
```

Motion tokens (usually fine with defaults):
```typescript
motionDurationFast: '0.1s',
motionDurationMid: '0.2s',
motionDurationSlow: '0.3s',
motionEaseInOut: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
// ... etc
```

## Implementation Checklist

- [x] Phase 0: Baseline (150/180 tokens mapped)
- [ ] Phase 1: Add 12 critical color tokens (Priority: HIGH)
- [ ] Phase 2A: Complete Card component tokens
- [ ] Phase 2B: Complete Button component tokens
- [ ] Phase 2C: Complete Table component tokens
- [ ] Phase 2D: Complete Input component tokens
- [ ] Phase 2E: Complete Select/Dropdown tokens
- [ ] Phase 3: Add typography tokens (if needed)
- [ ] Phase 4: Add motion tokens (optional)

## Testing Strategy

After adding tokens:

1. **Visual test** - Check all pages in both light/dark themes
2. **Component test** - Test each component individually:
   - Card borders and shadows
   - Button hover states
   - Table row selection
   - Input focus states
   - Dropdown selected items
3. **Edge cases** - Test disabled states, error states, loading states
4. **Browser test** - Test in Chrome, Firefox, Safari

## Expected Results

After Phase 1 completion:
- ✅ All critical color tokens mapped
- ✅ No more black/white colors in dark theme
- ✅ Consistent hover/active states
- ✅ Proper outline colors for inputs

After Phase 2 completion:
- ✅ All components fully themed
- ✅ No Ant Design default colors visible
- ✅ 100% CSS variable-driven theming
- ✅ Easy to create new themes (sepia, high-contrast, etc.)

## Code Generation Tool

To speed up Phase 2, use this template:

```typescript
// Template for complete component token mapping
ComponentName: {
  // 1. Inherit alias tokens
  colorText: 'var(--text-primary)',
  colorTextHeading: 'var(--text-primary)',
  colorBgContainer: 'var(--bg-secondary)',
  colorBorder: 'var(--border-primary)',

  // 2. Add component-specific color tokens
  // (look these up in node_modules/antd/es/component-name/style/index.d.ts)

  // 3. Add sizing tokens (usually fine with defaults)
  // fontSize, padding, height, etc.

  // 4. Test in both themes
},
```

---

**Last Updated:** 2026-01-28
**Completion:** 83% (150/180)
**Next Action:** Implement Phase 1 (critical color tokens)
