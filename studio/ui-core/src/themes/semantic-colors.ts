export const lightSemanticColors = {
  // Backgrounds
  'bg-primary': '#F9FAFB',    // Background (почти белый, но не режет глаза)
  'bg-secondary': '#FFFFFF',  // Surface / Card (карточки, панели, таблицы)
  'bg-tertiary': '#F3F4F6',   // Muted Surface (вторичные блоки, фильтры, сайдбар)
  
  // Text
  'text-primary': '#111827',   // Text Primary (почти чёрный, но мягкий)
  'text-secondary': '#6B7280', // Text Secondary (подписи, вторичный текст)
  'text-tertiary': '#6B7280',  // Text Tertiary (вторичный текст)
  'text-inverse': '#FFFFFF',   // Text Inverse (белый текст)
  
  // Borders
  'border-primary': '#E5E7EB', // Border (границы карточек, таблиц)
  'border-secondary': '#D4D4D4', // Border Secondary (более светлые границы)
  
  // Interactive
  'link': '#2563EB',          // Accent Primary (KB Blue — кнопки, ссылки, активные табы)
  'link-hover': '#1E40AF',    // Accent Hover (hover на синих элементах)
  'accent-subtle': '#DBEAFE', // Accent Subtle (фон и выделения для активных блоков)
  
  // Status
  'success': '#16A34A',       // Success (успешные статусы, зелёные метрики)
  'warning': '#F59E0B',       // Warning (предупреждения)
  'error': '#DC2626',         // Error (ошибки)
  'info': '#0EA5E9',          // Info (информационные состояния)
  
  // States
  'disabled': '#9CA3AF',      // Disabled (неактивные элементы)
  
  // Effects
  'shadow': 'rgba(0, 0, 0, 0.05)', // Shadow (тени для карточек и кнопок)
} as const;

export const darkSemanticColors = {
  // Backgrounds
  'bg-primary': '#0D0D0F',    // Background (глубокий, чуть теплее чистого чёрного)
  'bg-secondary': '#1A1A1C',  // Surface / Card (карточки и панели)
  'bg-tertiary': '#27272A',   // Muted Surface (вторичные зоны, hover-эффекты)
  
  // Text
  'text-primary': '#F5F5F7',  // Text Primary (основной текст)
  'text-secondary': '#A1A1AA', // Text Secondary (вторичный текст)
  'text-tertiary': '#A1A1AA',  // Text Tertiary (вторичный текст)
  'text-inverse': '#1A1A1C',   // Text Inverse (тёмный текст)
  
  // Borders
  'border-primary': '#3F3F46', // Border (границы элементов)
  'border-secondary': '#52525B', // Border Secondary (более светлые границы)
  
  // Interactive
  'link': '#3B82F6',          // Accent Primary (KB Blue)
  'link-hover': '#60A5FA',    // Accent Hover (hover для кнопок/ссылок)
  'accent-subtle': '#1E3A8A', // Accent Subtle (тонкий фон подсветки)
  
  // Status
  'success': '#22C55E',       // Success (успешные статусы)
  'warning': '#EAB308',        // Warning (предупреждения)
  'error': '#EF4444',         // Error (ошибки)
  'info': '#38BDF8',          // Info (информационные элементы)
  
  // States
  'disabled': '#52525B',      // Disabled (неактивные кнопки)
  
  // Effects
  'shadow': 'rgba(0, 0, 0, 0.4)', // Shadow (глубокие тени для контраста)
} as const;

