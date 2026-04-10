# KB Labs Studio - Обновлённый план рефакторинга (Phase 4-7)

**Дата:** 2026-01-27
**Цель:** Подготовка к сеньор React собеседованию
**Статус:** Phase 0-3 завершены (530 → 312 строк widget-renderer.tsx)

---

## ✅ Завершённые фазы (Phase 0-3)

### Phase 0: Подготовка (✅ Завершена)
- E2E тесты (Playwright) для критических путей
- Baseline документация

### Phase 1: Type Safety (✅ Завершена)
- Zod схемы для 29 типов виджетов
- Удалены все `any` типы
- ConfigProvider с валидацией

### Phase 2-3: Component Architecture (✅ Завершена)
- 7 хуков извлечены из widget-renderer.tsx
- Сокращение с 530 → 312 строк (-41%)
- Улучшена тестируемость и переиспользование

**Созданные модули:**
- `useWidgetEventSubscription` - события
- `useCircularDependencyDetection` - защита от циклов
- `useWidgetDataMerger` - слияние данных
- `useWidgetComponentLoader` - динамическая загрузка
- `useWidgetChangeHandler` - обработчик форм
- `useHeaderNotice` - header policy
- `WithWidgetState` HOC - валидация/loading/error

---

## 🎯 Phase 4: UI Kit & Design System (НОВАЯ ФАЗА)

**Цель:** Убрать inline стили, создать единую систему дизайна

### Проблемы сейчас:
```tsx
// ❌ BAD: Inline стили везде
<div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
<div style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.2 }}>
```

### Решение:

#### 4.1 Создать styled-components или CSS modules подход (2-3 дня)

**Вариант A: CSS Modules** (проще, быстрее)
```tsx
// Metric.module.css
.metricLabel {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.metricValue {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
}

// Metric.tsx
import styles from './Metric.module.css';

export function Metric({ data }) {
  return (
    <div className={styles.metricLabel}>{label}</div>
    <div className={styles.metricValue}>{value}</div>
  );
}
```

**Вариант B: Tailwind CSS** (современный, быстрый)
```tsx
// Metric.tsx
export function Metric({ data }) {
  return (
    <div className="text-sm text-gray-600 mb-2">{label}</div>
    <div className="text-2xl font-bold">{value}</div>
  );
}
```

**Рекомендация:** Tailwind CSS
- Быстрее разработка
- Меньше файлов
- Консистентные значения
- Индустриальный стандарт для сеньор собеседований

#### 4.2 Извлечь общие стили в design tokens (1 день)
```tsx
// packages/studio-ui-core/src/tokens/typography.ts
export const typography = {
  sizes: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
  },
  weights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
};
```

#### 4.3 Создать reusable UI компоненты (2-3 дня)

**Структура нового UI Kit:**
```
packages/studio-ui/src/
├── components/
│   ├── Typography/       # Text, Heading, Label
│   ├── Layout/          # Box, Flex, Grid, Stack
│   ├── Feedback/        # Alert, Toast, Skeleton
│   ├── DataDisplay/     # Card, Badge, Tag, Metric
│   └── Form/            # Input, Select, Checkbox
├── hooks/
│   ├── useTheme.ts
│   └── useBreakpoint.ts
└── styles/
    └── tokens.ts        # Design tokens
```

**Пример чистого компонента:**
```tsx
// packages/studio-ui/src/components/DataDisplay/MetricCard.tsx
import { Card } from '../Layout/Card';
import { Text } from '../Typography/Text';
import { Badge } from './Badge';

export interface MetricCardProps {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  delta?: number;
  unit?: string;
}

export function MetricCard({ label, value, trend, delta, unit }: MetricCardProps) {
  return (
    <Card>
      <Text variant="label" className="mb-2">{label}</Text>
      <Flex align="baseline" gap="2">
        <Text variant="display" color={trend === 'up' ? 'success' : trend === 'down' ? 'error' : 'default'}>
          {value}
        </Text>
        {unit && <Text variant="body" color="secondary">{unit}</Text>}
      </Flex>
      {delta !== undefined && (
        <Badge variant={delta >= 0 ? 'success' : 'error'}>
          {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}%
        </Badge>
      )}
    </Card>
  );
}
```

---

## 🎯 Phase 5: Component Composition Patterns (2-3 дня)

**Цель:** Улучшить переиспользование через composition

### 5.1 Compound Components Pattern
```tsx
// ❌ BAD: Монолитный компонент с 20 props
<Card
  title="..."
  description="..."
  footer="..."
  avatar="..."
  showHeader={true}
  // ... ещё 15 props
/>

// ✅ GOOD: Compound components
<Card>
  <Card.Header>
    <Card.Avatar src="..." />
    <Card.Title>Title</Card.Title>
  </Card.Header>
  <Card.Body>Content</Card.Body>
  <Card.Footer>Footer</Card.Footer>
</Card>
```

### 5.2 Render Props / Children as Function
```tsx
// Flexible data rendering
<DataTable data={users}>
  {(user) => (
    <tr>
      <td>{user.name}</td>
      <td>{user.email}</td>
    </tr>
  )}
</DataTable>
```

### 5.3 Polymorphic Components
```tsx
// Один компонент - разные HTML элементы
<Text as="h1">Heading</Text>
<Text as="p">Paragraph</Text>
<Text as="span">Span</Text>
```

---

## 🎯 Phase 6: Performance Optimization (2 дня)

### 6.1 React.memo для дорогих компонентов
```tsx
export const ExpensiveChart = React.memo(Chart, (prev, next) => {
  return prev.data === next.data;
});
```

### 6.2 useMemo/useCallback для вычислений
```tsx
const sortedData = React.useMemo(
  () => data.sort((a, b) => a.value - b.value),
  [data]
);
```

### 6.3 Code splitting для виджетов
```tsx
const ChartWidget = React.lazy(() => import('./widgets/ChartWidget'));

<Suspense fallback={<Skeleton />}>
  <ChartWidget {...props} />
</Suspense>
```

### 6.4 Виртуализация для больших списков
```tsx
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={1000}
  itemSize={50}
>
  {Row}
</FixedSizeList>
```

---

## 🎯 Phase 7: Testing & Documentation (3-4 дня)

### 7.1 Unit тесты для хуков
```tsx
// useWidgetEventSubscription.test.ts
describe('useWidgetEventSubscription', () => {
  it('should subscribe to events and update params', () => {
    // ...
  });
});
```

### 7.2 Component tests с Testing Library
```tsx
// MetricCard.test.tsx
it('should display trend indicator', () => {
  render(<MetricCard value={100} trend="up" />);
  expect(screen.getByText('↑')).toBeInTheDocument();
});
```

### 7.3 Storybook для UI Kit
```tsx
// MetricCard.stories.tsx
export default {
  title: 'DataDisplay/MetricCard',
  component: MetricCard,
};

export const Success = {
  args: {
    label: 'Revenue',
    value: '$12,345',
    trend: 'up',
    delta: 15.3,
  },
};
```

### 7.4 Документация
- README с примерами
- API reference для каждого компонента
- Migration guide (старые виджеты → новые)

---

## 📋 Приоритизация для собеседования

**Что делать в первую очередь (максимальный эффект):**

1. **Phase 4.3** - Создать 5-7 ключевых UI компонентов (Card, Metric, Button, Input)
2. **Phase 5.1** - Показать compound components на примере Card
3. **Phase 6.3** - Code splitting для демонстрации performance awareness
4. **Phase 7.3** - Storybook с 2-3 компонентами

**Что можно пропустить:**
- Phase 4.1 (CSS Modules) - если выбираем Tailwind
- Phase 6.4 (Виртуализация) - если нет больших списков
- Phase 7.1-7.2 (Unit tests) - если времени мало

---

## 🎓 Что покажет на собеседовании

### Senior React Skills:
- ✅ **TypeScript** - discriminated unions, generics, strict mode
- ✅ **Component Composition** - compound components, render props
- ✅ **Custom Hooks** - 7 хуков с чистой логикой
- ✅ **Performance** - memo, useMemo, code splitting
- ✅ **Design System** - tokens, UI Kit, consistency
- ✅ **Architecture** - HOC, extraction, separation of concerns
- ✅ **Testing** - E2E, unit tests, Storybook
- ✅ **Best Practices** - no inline styles, reusable components

### Code Samples для портфолио:
1. `useWidgetEventSubscription.ts` - сложный хук с подписками
2. `WithWidgetState.tsx` - HOC с валидацией
3. `MetricCard.tsx` - чистый UI компонент
4. `Card.tsx` - compound components pattern
5. `widget-renderer.tsx` - рефакторинг 530 → 312 строк

---

## ⏱️ Timeline

| Фаза | Время | Приоритет |
|------|-------|-----------|
| Phase 4.3 (UI Kit) | 2-3 дня | 🔥 HIGH |
| Phase 5.1 (Composition) | 1 день | 🔥 HIGH |
| Phase 6.3 (Code Splitting) | 0.5 дня | 🟡 MED |
| Phase 7.3 (Storybook) | 1 день | 🟡 MED |
| Phase 4.1 (Styles) | 1 день | 🟢 LOW |
| Phase 6.1-6.2 (Perf) | 1 день | 🟢 LOW |
| Phase 7.1-7.2 (Tests) | 2 дня | 🟢 LOW |

**Minimum viable для собеседования:** 4-5 дней
**Полный рефакторинг:** 11-15 дней

---

## Следующий шаг

Продолжить с **Phase 4.3: Создание чистых UI компонентов**?

Начнём с:
1. `MetricCard` компонент (вместо inline стилей в Metric.tsx)
2. `Card` компонент с compound pattern
3. `Badge` компонент для трендов

Или хочешь начать с другого?
