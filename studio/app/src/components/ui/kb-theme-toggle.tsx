import * as React from 'react';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { Sun, Moon, Monitor } from 'lucide-react';
import { UIButton } from '@kb-labs/studio-ui-kit';
import { useKBTheme, type ThemeMode } from './kb-config-provider';

const themeOptions: { key: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { key: 'light', label: 'Light', icon: <Sun size={16} /> },
  { key: 'dark', label: 'Dark', icon: <Moon size={16} /> },
  { key: 'auto', label: 'Auto', icon: <Monitor size={16} /> },
];

export function KBThemeToggle() {
  const { theme, setTheme } = useKBTheme();

  const currentTheme = themeOptions.find((opt) => opt.key === theme) ?? themeOptions[0]!;

  const items: MenuProps['items'] = themeOptions.map((option) => ({
    key: option.key,
    label: (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {option.icon}
        <span>{option.label}</span>
      </div>
    ),
    onClick: () => setTheme(option.key),
  }));

  return (
    <Dropdown menu={{ items, selectedKeys: [theme] }} placement="bottomRight">
      <UIButton
        variant="text"
        icon={React.cloneElement(currentTheme.icon as React.ReactElement, { size: 16 })}
        style={{ height: 32, display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}
      >
        {currentTheme.label}
      </UIButton>
    </Dropdown>
  );
}

