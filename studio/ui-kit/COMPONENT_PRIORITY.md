# UI Kit Component Priority List

## 🎯 Критерии приоритизации

1. **Частота использования** в виджетах
2. **Количество inline стилей** которые уберём
3. **Польза для твоего списка** (UIPage, UIHeader, etc.)

---

## ✅ Созданные компоненты (10)

### Primitives (3)
- ✅ UIText - Typography primitive
- ✅ UIBox - Spacing primitive
- ✅ UIFlex - Flexbox primitive

### Layout (1)
- ✅ UIStack - Vertical/horizontal spacing

### Core (5)
- ✅ UIBadge - Status indicators
- ✅ UIButton - Action buttons
- ✅ UICard - Card containers
- ✅ UITag - Labels/categories
- ✅ UITitle - Page/section titles

### Data (1)
- ✅ UIMetricCard - Metric display

---

## 🚀 Priority 1 - Часто используемые (нужно СРОЧНО)

### Form Components (используются в 6+ виджетах)
1. **UIInput** - Text input (используется в Input.tsx)
   - Variants: text, password, textarea, search
   - Убирает ~3 inline стилей

2. **UISelect** - Dropdown select (используется в Select.tsx)
   - С поддержкой icon в options
   - Убирает ~5 inline стилей

3. **UIForm** + **UIFormItem** - Form wrapper (используется в Form.tsx)
   - Layout: vertical, horizontal, inline
   - Validation support

4. **UICheckbox** - Checkbox input (используется в CheckboxGroup.tsx)
   - Single + group variants
   - Убирает ~2 inline стиля

5. **UISwitch** - Toggle switch (используется в Switch.tsx)
   - С label positioning
   - Убирает ~1 inline стиль

6. **UIDatePicker** - Date/time picker (используется в DatePicker.tsx)
   - Date + Time variants
   - Убирает ~0 inline стилей (уже чистый)

### Data Display (используются в 4+ виджетах)
7. **UITable** - Data table (используется в Table.tsx)
   - Sorting, pagination
   - Убирает ~0 inline стилей (использует Ant Table напрямую)

### Feedback (используются в shared/)
8. **UIAlert** - Alert messages (используется в Alert.tsx)
   - Variants: success, info, warning, error
   - Убирает ~0 inline стилей

9. **UIEmptyState** - Empty state (используется в EmptyState.tsx, везде)
   - С icon, title, description, action
   - Убирает ~0 inline стилей

10. **UIErrorState** - Error display (используется в ErrorState.tsx, везде)
    - С error details, retry button
    - Убирает ~0 inline стилей

11. **UISkeleton** - Loading skeleton (используется в Skeleton.tsx, везде)
    - Variants: text, card, avatar, list
    - Убирает ~0 inline стилей

---

## 🎨 Priority 2 - Для твоего списка (важно для архитектуры)

### Composite Components (для Page структуры)
12. **UIPage** - Page layout wrapper
    - Props: title, description, breadcrumbs, extra, maxWidth
    - Использует UIHeader внутри
    - **Польза:** Единая структура всех страниц

13. **UIHeader** - Page header
    - Props: title, description, extra
    - Breadcrumbs опционально
    - **Польза:** Консистентные заголовки

### Navigation (используются в 3+ виджетах)
14. **UITabs** - Tab navigation (используется в Tabs.tsx)
    - С icon support
    - Убирает ~2 inline стиля

15. **UIBreadcrumb** - Breadcrumb navigation (используется в Breadcrumb.tsx)
    - С icon support
    - Убирает ~0 inline стилей

16. **UIMenu** - Navigation menu (используется в Menu.tsx)
    - Dropdown support
    - Убирает ~0 inline стилей

### Overlay
17. **UIModal** - Modal dialogs (используется в Modal.tsx, Confirm.tsx)
    - Standard + Confirm variants
    - Убирает ~0 inline стилей

---

## 📦 Priority 3 - Специфичные компоненты (можно позже)

### Content
18. **UIMarkdownViewer** - Markdown renderer
    - Syntax highlighting
    - **Польза:** Для документации

### Data Display (специфичные)
19. **UITimeline** - Timeline component (используется в Timeline.tsx)
    - Убирает ~6 inline стилей

20. **UITree** - Tree view (используется в Tree.tsx)
    - Убирает ~0 inline стилей

21. **UIList** - List component
    - Убирает ~0 inline стилей

### Charts (обёртки вокруг @ant-design/charts)
22. **UIChartArea** - Area chart
23. **UIChartBar** - Bar chart
24. **UIChartLine** - Line chart
25. **UIChartPie** - Pie chart

---

## 💡 Priority 4 - Редко используемые (низкий приоритет)

### Layout
26. **UIGrid** - Grid layout (используется в Grid.tsx)
27. **UIDivider** - Section divider
28. **UISpacer** - Spacing component

### Navigation
29. **UIStepper** - Step indicator (используется в Stepper.tsx)

### Feedback
30. **UITooltip** - Tooltip overlay

### Data Display
31. **UICollapse** - Collapsible sections (используется в Section.tsx если expandable)
32. **UIDiff** - Diff viewer (используется в Diff.tsx) - ~4 inline стиля
33. **UIJson** - JSON viewer (используется в Json.tsx) - ~8 inline стиля
34. **UILogs** - Log viewer (используется в Logs.tsx) - ~7 inline стиля

---

## 📊 Рекомендация по порядку реализации

### Этап 1 (сегодня): Form Components - **МАКСИМАЛЬНАЯ ПОЛЬЗА**
Убирает ~11 inline стилей, покрывает 6 виджетов:
1. UIInput
2. UISelect
3. UIForm + UIFormItem
4. UICheckbox
5. UISwitch
6. UIDatePicker

**Время:** ~1-2 часа
**Польза:** Огромная - используются везде

---

### Этап 2 (сегодня): Composite + Navigation - **АРХИТЕКТУРА**
Для структуры приложения:
7. UIPage
8. UIHeader
9. UIBreadcrumb
10. UITabs

**Время:** ~1 час
**Польза:** Единая структура страниц

---

### Этап 3 (завтра): Feedback + Data
Стандартные состояния:
11. UIAlert
12. UIEmptyState
13. UIErrorState
14. UISkeleton
15. UITable

**Время:** ~1 час
**Польза:** Убирает дублирование ErrorState/EmptyState

---

### Этап 4 (позже): Специфичные
16. UIModal
17. UITimeline (6 inline стилей!)
18. UIMarkdownViewer
19. UIMenu
20. UITree

**Время:** ~2 часа
**Польза:** Средняя

---

## 🎯 Итого

**Всего компонентов:** 34 (10 готово, 24 осталось)

**Приоритет 1 (11 компонентов):** Form + Feedback + Data - используются чаще всего

**Приоритет 2 (6 компонентов):** Composite + Navigation - архитектура приложения

**Приоритет 3 (8 компонентов):** Специфичные виджеты

**Приоритет 4 (9 компонентов):** Редко используемые

---

## ❓ Вопрос к тебе

**Что делаем дальше?**

**Вариант A:** Этап 1 - Form Components (UIInput, UISelect, UIForm, UICheckbox, UISwitch, UIDatePicker)
- **Польза:** Уберём ~11 inline стилей, покроем 6 виджетов
- **Время:** ~1-2 часа

**Вариант B:** Этап 2 - Composite + Navigation (UIPage, UIHeader, UIBreadcrumb, UITabs)
- **Польза:** Единая структура страниц, архитектура
- **Время:** ~1 час

**Вариант C:** Гибрид - самые важные по 2-3 из каждой категории
- UIInput, UISelect (form)
- UIPage, UIHeader (composite)
- UIAlert, UISkeleton (feedback)

**Что выбираешь?**
