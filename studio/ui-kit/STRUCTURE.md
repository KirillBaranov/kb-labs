# @kb-labs/studio-ui-kit - Package Structure

## 📁 Folder Organization

```
src/
├── primitives/          # Foundation components (Tier 1)
│   ├── UIText.tsx
│   ├── UIBox.tsx
│   ├── UIFlex.tsx
│   └── index.ts
│
├── layout/              # Layout components
│   ├── UIStack.tsx
│   ├── UIGrid.tsx
│   ├── UIDivider.tsx
│   └── index.ts
│
├── core/                # Core UI components (Tier 2)
│   ├── UIButton.tsx
│   ├── UICard.tsx
│   ├── UIBadge.tsx
│   ├── UITag.tsx
│   ├── UITitle.tsx
│   └── index.ts
│
├── data/                # Data display components
│   ├── UITable.tsx
│   ├── UIMetricCard.tsx
│   └── index.ts
│
├── feedback/            # Feedback components
│   ├── UIAlert.tsx
│   ├── UIEmptyState.tsx
│   ├── UIErrorState.tsx
│   ├── UISkeleton.tsx
│   └── index.ts
│
├── navigation/          # Navigation components
│   ├── UITabs.tsx
│   ├── UIBreadcrumb.tsx
│   ├── UIMenu.tsx
│   └── index.ts
│
├── overlay/             # Overlay components
│   ├── UIModal.tsx
│   ├── UITooltip.tsx
│   └── index.ts
│
├── form/                # Form components
│   ├── UIInput.tsx
│   ├── UISelect.tsx
│   ├── UICheckbox.tsx
│   ├── UISwitch.tsx
│   ├── UIDatePicker.tsx
│   ├── UIForm.tsx
│   └── index.ts
│
├── content/             # Content components
│   ├── UIMarkdownViewer.tsx
│   └── index.ts
│
├── composite/           # Composite/Page components (Tier 3)
│   ├── UIPage.tsx
│   ├── UIHeader.tsx
│   └── index.ts
│
└── index.ts             # Main export
```

## 🎯 Import Strategy

### For users:
```tsx
// Named imports (recommended)
import { UIButton, UICard, UIText } from '@kb-labs/studio-ui-kit';

// Category imports (when using many from same category)
import { UIButton, UIBadge, UITag } from '@kb-labs/studio-ui-kit/core';
import { UITable, UIMetricCard } from '@kb-labs/studio-ui-kit/data';
```

## 📦 Categories

### 1. Primitives
Low-level building blocks - **NO Ant Design components**, pure React + tokens
- UIText, UIBox, UIFlex

### 2. Layout
Layout and spacing utilities
- UIStack, UIGrid, UIDivider

### 3. Core
Essential UI components wrapping Ant Design
- UIButton, UICard, UIBadge, UITag, UITitle

### 4. Data
Data display and visualization
- UITable, UIMetricCard

### 5. Feedback
User feedback and states
- UIAlert, UIEmptyState, UIErrorState, UISkeleton

### 6. Navigation
Navigation and routing
- UITabs, UIBreadcrumb, UIMenu

### 7. Overlay
Overlays and popups
- UIModal, UITooltip

### 8. Form
Form inputs and controls
- UIInput, UISelect, UICheckbox, UISwitch, UIDatePicker, UIForm

### 9. Content
Rich content display
- UIMarkdownViewer

### 10. Composite
High-level page components
- UIPage, UIHeader

---

## 🚀 Next Steps

1. Create folder structure
2. Move existing components to appropriate folders
3. Create barrel exports (index.ts) for each category
4. Update main index.ts with category re-exports
5. Implement missing components by priority
