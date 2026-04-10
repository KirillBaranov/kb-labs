# KB Labs Studio UI Kit - Component List

## 🎯 Required Components (User-Specified)

### Core Components

1. **UICard** - Card container with header/footer
2. **UITitle** - Page/section titles with hierarchy
3. **UIPage** - Page layout wrapper with consistent structure
4. **UIBadge** - Status indicators and labels
5. **UITable** - Data table with sorting/filtering
6. **UIButton** - Action buttons with variants
7. **UITabs** - Tab navigation
8. **UIMarkdownViewer** - Markdown content renderer
9. **UIModal** - Modal dialogs
10. **UIHeader** - Page header (title + description + breadcrumbs)
11. **UIText** - Typography component

### Form Components

12. **UIInput** - Text input
13. **UISelect** - Dropdown select
14. **UICheckbox** - Checkbox input
15. **UICheckboxGroup** - Checkbox group
16. **UISwitch** - Toggle switch
17. **UIDatePicker** - Date/time picker
18. **UIForm** - Form wrapper with validation

## 📊 Additional Components (Based on Current Usage)

### Layout & Structure

19. **UIStack** - Vertical/horizontal spacing layout
20. **UIFlex** - Flexbox layout primitive
21. **UIBox** - Box model primitive with spacing
22. **UIGrid** - Grid layout (Row/Col wrapper)
23. **UISpacer** - Spacing component
24. **UIDivider** - Section divider

### Display & Feedback

25. **UIMetricCard** - Metric display with trend ✅ (exists)
26. **UIAlert** - Alert/notification messages
27. **UIEmptyState** - Empty state placeholder
28. **UIErrorState** - Error display
29. **UISkeleton** - Loading skeleton
30. **UITag** - Label/category tag
31. **UITooltip** - Tooltip overlay

### Navigation

32. **UIBreadcrumb** - Breadcrumb navigation
33. **UIMenu** - Navigation menu
34. **UIStepper** - Step indicator

### Data Display

35. **UITimeline** - Timeline component
36. **UIList** - List component
37. **UICollapse** - Collapsible sections
38. **UITree** - Tree view

## 🏗️ Component Implementation Plan

### Phase 1: Primitives & Utilities ✅ (Complete)
- ✅ UIBox (Box.tsx) - spacing primitive
- ✅ UIFlex (Flex.tsx) - flexbox primitive
- ✅ UIText (Text.tsx) - typography primitive

### Phase 2: Core UI Components (Priority 1)

#### 2.1 UICard
```typescript
// apps/studio/src/ui/UICard.tsx
export interface UICardProps {
  title?: string;
  subtitle?: string;
  extra?: React.ReactNode;
  footer?: React.ReactNode;
  bordered?: boolean;
  hoverable?: boolean;
  loading?: boolean;
  size?: 'small' | 'default';
  children: React.ReactNode;
}

export function UICard({ title, subtitle, extra, footer, bordered, hoverable, loading, size, children }: UICardProps) {
  const { token } = useToken();

  return (
    <Card size={size} bordered={bordered} hoverable={hoverable} loading={loading}>
      {(title || extra) && (
        <Box mb={3}>
          <Flex justify="between" align="center">
            {title && (
              <Box>
                <Text size="lg" weight="semibold" as="div">{title}</Text>
                {subtitle && <Text size="sm" color="secondary">{subtitle}</Text>}
              </Box>
            )}
            {extra}
          </Flex>
        </Box>
      )}
      <Box>{children}</Box>
      {footer && (
        <Box mt={3} pt={3} style={{ borderTop: `1px solid ${token.colorBorder}` }}>
          {footer}
        </Box>
      )}
    </Card>
  );
}
```

#### 2.2 UITitle
```typescript
// apps/studio/src/ui/UITitle.tsx
export type UITitleLevel = 1 | 2 | 3 | 4 | 5;

export interface UITitleProps {
  level?: UITitleLevel;
  children: React.ReactNode;
  subtitle?: string;
  className?: string;
}

export function UITitle({ level = 1, children, subtitle, className }: UITitleProps) {
  return (
    <Box mb={subtitle ? 2 : 3}>
      <AntTitle level={level} className={className} style={{ margin: 0 }}>
        {children}
      </AntTitle>
      {subtitle && (
        <Text size="base" color="secondary" as="div" style={{ marginTop: spacing[1] }}>
          {subtitle}
        </Text>
      )}
    </Box>
  );
}
```

#### 2.3 UIPage
```typescript
// apps/studio/src/ui/UIPage.tsx
export interface UIPageProps {
  title?: string;
  description?: string;
  breadcrumbs?: { label: string; href?: string }[];
  extra?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

export function UIPage({ title, description, breadcrumbs, extra, children, maxWidth = 'xl' }: UIPageProps) {
  const maxWidthMap = {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    full: '100%',
  };

  return (
    <Box p={6} style={{ maxWidth: maxWidthMap[maxWidth], margin: '0 auto' }}>
      {breadcrumbs && <UIBreadcrumb items={breadcrumbs} />}
      {(title || description || extra) && (
        <UIHeader title={title} description={description} extra={extra} />
      )}
      <Box mt={6}>{children}</Box>
    </Box>
  );
}
```

#### 2.4 UIHeader
```typescript
// apps/studio/src/ui/UIHeader.tsx
export interface UIHeaderProps {
  title?: string;
  description?: string;
  extra?: React.ReactNode;
}

export function UIHeader({ title, description, extra }: UIHeaderProps) {
  return (
    <Box mb={6}>
      <Flex justify="between" align="start" gap={4}>
        <Box>
          {title && <UITitle level={1}>{title}</UITitle>}
          {description && (
            <Text size="base" color="secondary" as="div" style={{ marginTop: spacing[2] }}>
              {description}
            </Text>
          )}
        </Box>
        {extra && <Box>{extra}</Box>}
      </Flex>
    </Box>
  );
}
```

#### 2.5 UIBadge
```typescript
// apps/studio/src/ui/UIBadge.tsx (already exists, enhance)
export type UIBadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'default';

export interface UIBadgeProps {
  variant?: UIBadgeVariant;
  children?: React.ReactNode;
  count?: number;
  dot?: boolean;
}

export function UIBadge({ variant = 'default', children, count, dot }: UIBadgeProps) {
  const { token } = useToken();

  const colorMap: Record<UIBadgeVariant, string> = {
    success: token.colorSuccess,
    warning: token.colorWarning,
    error: token.colorError,
    info: token.colorInfo,
    default: token.colorTextSecondary,
  };

  if (count !== undefined || dot) {
    return <AntBadge count={count} dot={dot} color={colorMap[variant]}>{children}</AntBadge>;
  }

  if (children) {
    return <AntBadge color={colorMap[variant]} text={children} />;
  }

  return <AntBadge status={statusMap[variant]} />;
}
```

#### 2.6 UIButton
```typescript
// apps/studio/src/ui/UIButton.tsx
export type UIButtonVariant = 'primary' | 'default' | 'dashed' | 'text' | 'link';
export type UIButtonSize = 'small' | 'middle' | 'large';
export type UIButtonType = 'default' | 'danger';

export interface UIButtonProps {
  variant?: UIButtonVariant;
  size?: UIButtonSize;
  danger?: boolean;
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  block?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}

export function UIButton({ variant = 'default', size = 'middle', danger, icon, loading, disabled, block, onClick, children }: UIButtonProps) {
  return (
    <AntButton
      type={variant}
      size={size}
      danger={danger}
      icon={icon}
      loading={loading}
      disabled={disabled}
      block={block}
      onClick={onClick}
    >
      {children}
    </AntButton>
  );
}
```

### Phase 3: Data & Navigation Components (Priority 2)

#### 3.1 UITable
```typescript
// apps/studio/src/ui/UITable.tsx
export interface UITableColumn<T> {
  key: string;
  title: string;
  dataIndex?: keyof T;
  render?: (value: any, record: T, index: number) => React.ReactNode;
  sorter?: boolean;
  width?: number | string;
}

export interface UITableProps<T> {
  columns: UITableColumn<T>[];
  data: T[];
  loading?: boolean;
  pagination?: boolean | PaginationProps;
  rowKey?: string | ((record: T) => string);
  onRow?: (record: T) => void;
}

export function UITable<T extends Record<string, any>>({ columns, data, loading, pagination, rowKey, onRow }: UITableProps<T>) {
  return (
    <AntTable
      columns={columns}
      dataSource={data}
      loading={loading}
      pagination={pagination}
      rowKey={rowKey}
      onRow={onRow ? (record) => ({ onClick: () => onRow(record) }) : undefined}
    />
  );
}
```

#### 3.2 UITabs
```typescript
// apps/studio/src/ui/UITabs.tsx
export interface UITabItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  disabled?: boolean;
}

export interface UITabsProps {
  items: UITabItem[];
  defaultActiveKey?: string;
  activeKey?: string;
  onChange?: (key: string) => void;
  type?: 'line' | 'card';
}

export function UITabs({ items, defaultActiveKey, activeKey, onChange, type = 'line' }: UITabsProps) {
  return (
    <AntTabs
      type={type}
      defaultActiveKey={defaultActiveKey}
      activeKey={activeKey}
      onChange={onChange}
      items={items.map(item => ({
        key: item.key,
        label: (
          <Flex align="center" gap={2}>
            {item.icon}
            <span>{item.label}</span>
          </Flex>
        ),
        children: item.children,
        disabled: item.disabled,
      }))}
    />
  );
}
```

#### 3.3 UIBreadcrumb
```typescript
// apps/studio/src/ui/UIBreadcrumb.tsx
export interface UIBreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

export interface UIBreadcrumbProps {
  items: UIBreadcrumbItem[];
}

export function UIBreadcrumb({ items }: UIBreadcrumbProps) {
  return (
    <AntBreadcrumb
      items={items.map(item => ({
        title: (
          <Flex align="center" gap={1}>
            {item.icon}
            <span>{item.label}</span>
          </Flex>
        ),
        href: item.href,
      }))}
    />
  );
}
```

#### 3.4 UIModal
```typescript
// apps/studio/src/ui/UIModal.tsx
export interface UIModalProps {
  open: boolean;
  title?: string;
  onOk?: () => void;
  onCancel?: () => void;
  okText?: string;
  cancelText?: string;
  width?: number | string;
  footer?: React.ReactNode | null;
  children: React.ReactNode;
}

export function UIModal({ open, title, onOk, onCancel, okText, cancelText, width, footer, children }: UIModalProps) {
  return (
    <AntModal
      open={open}
      title={title}
      onOk={onOk}
      onCancel={onCancel}
      okText={okText}
      cancelText={cancelText}
      width={width}
      footer={footer}
    >
      {children}
    </AntModal>
  );
}
```

### Phase 4: Form Components (Priority 3)

#### 4.1 UIForm
```typescript
// apps/studio/src/ui/UIForm.tsx
export interface UIFormProps {
  layout?: 'horizontal' | 'vertical' | 'inline';
  onFinish?: (values: any) => void;
  onFinishFailed?: (errorInfo: any) => void;
  initialValues?: Record<string, any>;
  children: React.ReactNode;
}

export function UIForm({ layout = 'vertical', onFinish, onFinishFailed, initialValues, children }: UIFormProps) {
  return (
    <AntForm
      layout={layout}
      onFinish={onFinish}
      onFinishFailed={onFinishFailed}
      initialValues={initialValues}
    >
      {children}
    </AntForm>
  );
}

// Export Form.Item as UIFormItem
export const UIFormItem = AntForm.Item;
```

#### 4.2 UIInput
```typescript
// apps/studio/src/ui/UIInput.tsx
export interface UIInputProps {
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  onChange?: (value: string) => void;
  onPressEnter?: () => void;
}

export function UIInput({ value, defaultValue, placeholder, disabled, prefix, suffix, onChange, onPressEnter }: UIInputProps) {
  return (
    <AntInput
      value={value}
      defaultValue={defaultValue}
      placeholder={placeholder}
      disabled={disabled}
      prefix={prefix}
      suffix={suffix}
      onChange={(e) => onChange?.(e.target.value)}
      onPressEnter={onPressEnter}
    />
  );
}

// Export variants
export const UIInputPassword = AntInput.Password;
export const UIInputTextArea = AntInput.TextArea;
export const UIInputSearch = AntInput.Search;
```

#### 4.3 UISelect
```typescript
// apps/studio/src/ui/UISelect.tsx
export interface UISelectOption {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface UISelectProps {
  options: UISelectOption[];
  value?: string | number;
  defaultValue?: string | number;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  allowClear?: boolean;
  showSearch?: boolean;
  onChange?: (value: string | number) => void;
}

export function UISelect({ options, value, defaultValue, placeholder, disabled, loading, allowClear, showSearch, onChange }: UISelectProps) {
  return (
    <AntSelect
      value={value}
      defaultValue={defaultValue}
      placeholder={placeholder}
      disabled={disabled}
      loading={loading}
      allowClear={allowClear}
      showSearch={showSearch}
      onChange={onChange}
      options={options.map(opt => ({
        label: opt.icon ? (
          <Flex align="center" gap={2}>
            {opt.icon}
            <span>{opt.label}</span>
          </Flex>
        ) : opt.label,
        value: opt.value,
        disabled: opt.disabled,
      }))}
    />
  );
}
```

#### 4.4-4.6 Other Form Components
```typescript
// UICheckbox, UISwitch, UIDatePicker - similar wrappers around Ant Design components
```

### Phase 5: Display & Feedback Components (Priority 4)

#### 5.1 UIMarkdownViewer
```typescript
// apps/studio/src/ui/UIMarkdownViewer.tsx
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export interface UIMarkdownViewerProps {
  content: string;
  className?: string;
}

export function UIMarkdownViewer({ content, className }: UIMarkdownViewerProps) {
  const { token } = useToken();

  return (
    <Box className={className}>
      <ReactMarkdown
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <SyntaxHighlighter
                style={vscDarkPlus}
                language={match[1]}
                PreTag="div"
                {...props}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </Box>
  );
}
```

#### 5.2 UIAlert
```typescript
// apps/studio/src/ui/UIAlert.tsx
export type UIAlertType = 'success' | 'info' | 'warning' | 'error';

export interface UIAlertProps {
  type?: UIAlertType;
  message: string;
  description?: string;
  closable?: boolean;
  onClose?: () => void;
  showIcon?: boolean;
}

export function UIAlert({ type = 'info', message, description, closable, onClose, showIcon }: UIAlertProps) {
  return (
    <AntAlert
      type={type}
      message={message}
      description={description}
      closable={closable}
      onClose={onClose}
      showIcon={showIcon}
    />
  );
}
```

#### 5.3 UIEmptyState
```typescript
// apps/studio/src/ui/UIEmptyState.tsx
export interface UIEmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function UIEmptyState({ title, description, icon, action }: UIEmptyStateProps) {
  return (
    <Box p={8} style={{ textAlign: 'center' }}>
      {icon && <Box mb={3}>{icon}</Box>}
      {title && <Text size="lg" weight="semibold" as="div">{title}</Text>}
      {description && <Text size="sm" color="secondary" as="div" style={{ marginTop: spacing[2] }}>{description}</Text>}
      {action && <Box mt={4}>{action}</Box>}
    </Box>
  );
}
```

### Phase 6: Layout & Utility Components (Priority 5)

#### 6.1 UIStack
```typescript
// apps/studio/src/ui/UIStack.tsx
export type UIStackDirection = 'vertical' | 'horizontal';
export type UIStackSpacing = SpacingValue;

export interface UIStackProps {
  direction?: UIStackDirection;
  spacing?: UIStackSpacing;
  align?: 'start' | 'end' | 'center' | 'stretch';
  children: React.ReactNode;
}

export function UIStack({ direction = 'vertical', spacing = 2, align, children }: UIStackProps) {
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

#### 6.2 UITag
```typescript
// apps/studio/src/ui/UITag.tsx
export type UITagVariant = 'success' | 'warning' | 'error' | 'info' | 'default' | 'neutral';

export interface UITagProps {
  variant?: UITagVariant;
  children: React.ReactNode;
  closable?: boolean;
  onClose?: () => void;
}

export function UITag({ variant = 'default', children, closable, onClose }: UITagProps) {
  const { token } = useToken();

  const colorMap: Record<UITagVariant, string> = {
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

## 📦 Export Structure

```typescript
// apps/studio/src/ui/index.ts
// Primitives
export * from './Text';      // UIText
export * from './Box';       // UIBox
export * from './Flex';      // UIFlex

// Core Components
export * from './UICard';
export * from './UITitle';
export * from './UIPage';
export * from './UIHeader';
export * from './UIBadge';
export * from './UIButton';

// Data & Navigation
export * from './UITable';
export * from './UITabs';
export * from './UIBreadcrumb';
export * from './UIModal';

// Form Components
export * from './UIForm';
export * from './UIInput';
export * from './UISelect';
export * from './UICheckbox';
export * from './UISwitch';
export * from './UIDatePicker';

// Display & Feedback
export * from './UIMarkdownViewer';
export * from './UIAlert';
export * from './UIEmptyState';
export * from './UIErrorState';
export * from './UISkeleton';
export * from './UITag';

// Layout & Utility
export * from './UIStack';
export * from './UIDivider';
export * from './UIGrid';

// Complex Components
export * from './MetricCard';  // UIMetricCard
```

## ✅ Implementation Checklist

### Phase 1: Primitives ✅
- [x] UIText (Text.tsx)
- [x] UIBox (Box.tsx)
- [x] UIFlex (Flex.tsx)

### Phase 2: Core UI (Next)
- [ ] UICard
- [ ] UITitle
- [ ] UIPage
- [ ] UIHeader
- [ ] UIBadge (enhance existing Badge.tsx)
- [ ] UIButton

### Phase 3: Data & Navigation
- [ ] UITable
- [ ] UITabs
- [ ] UIBreadcrumb
- [ ] UIModal

### Phase 4: Form Components
- [ ] UIForm + UIFormItem
- [ ] UIInput (+ variants)
- [ ] UISelect
- [ ] UICheckbox
- [ ] UISwitch
- [ ] UIDatePicker

### Phase 5: Display & Feedback
- [ ] UIMarkdownViewer
- [ ] UIAlert
- [ ] UIEmptyState
- [ ] UIErrorState
- [ ] UISkeleton
- [ ] UITag

### Phase 6: Layout & Utility
- [ ] UIStack
- [ ] UIDivider
- [ ] UIGrid

---

**Created**: 2026-01-27
**Next**: Implement Phase 2 - Core UI Components
