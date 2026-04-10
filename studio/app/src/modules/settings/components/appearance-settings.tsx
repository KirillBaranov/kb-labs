import * as React from 'react';
import {
  UIRadio,
  UIRadioGroup,
  UISwitch,
  UISpace,
  UICard,
  UITypographyText,
  UITypographyParagraph,
} from '@kb-labs/studio-ui-kit';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useSettings } from '@/providers/settings-provider';
import { useKBTheme } from '@/components/ui';

const FONT_SIZES = [
  { value: 'small' as const, label: 'Small', description: '13px - Compact view' },
  { value: 'medium' as const, label: 'Medium', description: '14px - Default' },
  { value: 'large' as const, label: 'Large', description: '16px - Better readability' },
];

export function AppearanceSettings() {
  const { theme, setTheme } = useKBTheme();
  const { settings, updateSettings } = useSettings();

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'auto') => {
    setTheme(newTheme);
    updateSettings({
      appearance: {
        ...settings.appearance,
        theme: newTheme,
      },
    });
  };

  const handleCompactModeChange = (checked: boolean) => {
    updateSettings({
      appearance: {
        ...settings.appearance,
        compactMode: checked,
      },
    });
  };

  const handleFontSizeChange = (e: any) => {
    updateSettings({
      appearance: {
        ...settings.appearance,
        fontSize: e.target.value,
      },
    });
  };

  return (
    <UISpace direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Theme Selection */}
      <div>
        <UITypographyText strong style={{ fontSize: 16, display: 'block', marginBottom: 12 }}>
          Theme
        </UITypographyText>
        <UITypographyParagraph type="secondary" style={{ marginBottom: 16 }}>
          Choose how KB Studio looks to you. Select a single theme, or sync with your system.
        </UITypographyParagraph>

        <UISpace direction="horizontal" size="middle" style={{ width: '100%' }}>
          <UICard
            hoverable
            onClick={() => handleThemeChange('light')}
            style={{
              width: 200,
              border: theme === 'light' ? '2px solid var(--link)' : '1px solid var(--border-primary)',
              cursor: 'pointer',
            }}
            styles={{ body: { padding: 16 } }}
          >
            <div style={{ textAlign: 'center' }}>
              <Sun size={32} style={{ marginBottom: 8, color: '#F59E0B' }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Light</div>
              <UITypographyText type="secondary" style={{ fontSize: 12 }}>
                Bright and clean
              </UITypographyText>
            </div>
            <div
              style={{
                marginTop: 12,
                height: 40,
                background: 'linear-gradient(to right, #F9FAFB, #FFFFFF)',
                border: '1px solid #E5E7EB',
                borderRadius: 4,
              }}
            />
          </UICard>

          <UICard
            hoverable
            onClick={() => handleThemeChange('dark')}
            style={{
              width: 200,
              border: theme === 'dark' ? '2px solid var(--link)' : '1px solid var(--border-primary)',
              cursor: 'pointer',
            }}
            styles={{ body: { padding: 16 } }}
          >
            <div style={{ textAlign: 'center' }}>
              <Moon size={32} style={{ marginBottom: 8, color: '#6366F1' }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Dark</div>
              <UITypographyText type="secondary" style={{ fontSize: 12 }}>
                Easy on the eyes
              </UITypographyText>
            </div>
            <div
              style={{
                marginTop: 12,
                height: 40,
                background: 'linear-gradient(to right, #0D0D0F, #1A1A1C)',
                border: '1px solid #3F3F46',
                borderRadius: 4,
              }}
            />
          </UICard>

          <UICard
            hoverable
            onClick={() => handleThemeChange('auto')}
            style={{
              width: 200,
              border: theme === 'auto' ? '2px solid var(--link)' : '1px solid var(--border-primary)',
              cursor: 'pointer',
            }}
            styles={{ body: { padding: 16 } }}
          >
            <div style={{ textAlign: 'center' }}>
              <Monitor size={32} style={{ marginBottom: 8, color: '#8B5CF6' }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Auto</div>
              <UITypographyText type="secondary" style={{ fontSize: 12 }}>
                Sync with system
              </UITypographyText>
            </div>
            <div
              style={{
                marginTop: 12,
                height: 40,
                background: 'linear-gradient(to right, #F9FAFB 50%, #1A1A1C 50%)',
                border: '1px solid var(--border-primary)',
                borderRadius: 4,
              }}
            />
          </UICard>
        </UISpace>
      </div>

      {/* Compact Mode */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <UITypographyText strong style={{ fontSize: 16, display: 'block' }}>
              Compact Mode
            </UITypographyText>
            <UITypographyParagraph type="secondary" style={{ marginBottom: 0, marginTop: 4 }}>
              Reduce spacing and padding for a denser layout
            </UITypographyParagraph>
          </div>
          <UISwitch
            checked={settings.appearance.compactMode}
            onChange={handleCompactModeChange}
          />
        </div>
      </div>

      {/* Font Size */}
      <div>
        <UITypographyText strong style={{ fontSize: 16, display: 'block', marginBottom: 12 }}>
          Font Size
        </UITypographyText>
        <UITypographyParagraph type="secondary" style={{ marginBottom: 16 }}>
          Adjust the base font size across the application
        </UITypographyParagraph>

        <UIRadioGroup
          value={settings.appearance.fontSize}
          onChange={handleFontSizeChange}
          style={{ width: '100%' }}
        >
          <UISpace direction="vertical" style={{ width: '100%' }}>
            {FONT_SIZES.map((size) => (
              <UIRadio key={size.value} value={size.value} style={{ display: 'flex', alignItems: 'center' }}>
                <div>
                  <UITypographyText strong>{size.label}</UITypographyText>
                  <br />
                  <UITypographyText type="secondary" style={{ fontSize: 12 }}>
                    {size.description}
                  </UITypographyText>
                </div>
              </UIRadio>
            ))}
          </UISpace>
        </UIRadioGroup>
      </div>
    </UISpace>
  );
}
