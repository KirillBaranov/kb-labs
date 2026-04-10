import { useState } from 'react';
import { UIRangePicker, UISelect, UISpace } from '@kb-labs/studio-ui-kit';
import { CalendarOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';

/**
 * Predefined date range presets
 */
const DATE_PRESETS = [
  { label: 'Last 7 days', value: 7 as number | 'custom' },
  { label: 'Last 30 days', value: 30 as number | 'custom' },
  { label: 'Last 90 days', value: 90 as number | 'custom' },
  { label: 'Custom range', value: 'custom' as number | 'custom' },
];

export type DateRangeValue = [Dayjs, Dayjs];

export interface AnalyticsDateRangePickerProps {
  /**
   * Current date range value
   */
  value: DateRangeValue;

  /**
   * Callback when date range changes
   */
  onChange: (range: DateRangeValue) => void;

  /**
   * Show preset selector (default: true)
   */
  showPresets?: boolean;

  /**
   * Date format (default: DD/MM/YYYY)
   */
  format?: string;
}

/**
 * Analytics Date Range Picker Component
 *
 * Provides a consistent date range selection UI for all analytics pages.
 * Features:
 * - Quick presets (7/30/90 days)
 * - Custom date range picker
 * - Unified styling
 */
export function AnalyticsDateRangePicker({
  value,
  onChange,
  showPresets = true,
  format = 'DD/MM/YYYY',
}: AnalyticsDateRangePickerProps) {
  // Determine current preset based on date range
  const getCurrentPreset = (): number | 'custom' => {
    const daysDiff = dayjs().diff(value[0], 'days');
    const isToday = value[1].isSame(dayjs(), 'day');

    if (isToday) {
      if (daysDiff === 7) {return 7;}
      if (daysDiff === 30) {return 30;}
      if (daysDiff === 90) {return 90;}
    }

    return 'custom';
  };

  const [selectedPreset, setSelectedPreset] = useState<number | 'custom'>(getCurrentPreset());

  const handlePresetChange = (preset: number | 'custom') => {
    setSelectedPreset(preset);

    if (preset !== 'custom') {
      const newRange: DateRangeValue = [
        dayjs().subtract(preset, 'days'),
        dayjs(),
      ];
      onChange(newRange);
    }
  };

  const handleDateChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates && dates[0] && dates[1]) {
      setSelectedPreset('custom');
      onChange([dates[0], dates[1]]);
    }
  };

  if (!showPresets) {
    return (
      <UIRangePicker
        value={value}
        onChange={handleDateChange}
        format={format}
        allowClear={false}
        suffixIcon={<CalendarOutlined />}
      />
    );
  }

  return (
    <UISpace size="small">
      <UISelect
        value={selectedPreset}
        onChange={(v) => handlePresetChange(v as number | 'custom')}
        options={DATE_PRESETS}
        style={{ width: 150 }}
      />
      {selectedPreset === 'custom' && (
        <UIRangePicker
          value={value}
          onChange={handleDateChange}
          format={format}
          allowClear={false}
          suffixIcon={<CalendarOutlined />}
        />
      )}
    </UISpace>
  );
}
