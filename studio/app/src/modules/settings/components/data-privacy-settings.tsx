import * as React from 'react';
import {
  UIButton,
  UISpace,
  UITypographyParagraph,
  UITitle,
  UIMessage,
  UIUpload,
  UIIcon,
  UIPopconfirm,
} from '@kb-labs/studio-ui-kit';
import type { UploadProps } from 'antd/es/upload';
import { theme } from 'antd';
import { useSettings } from '@/providers/settings-provider';

export function DataPrivacySettings() {
  const { token } = theme.useToken();
  const { exportSettings, importSettings, resetSettings } = useSettings();

  const handleExport = () => {
    try {
      exportSettings();
      UIMessage.success('Settings exported successfully');
    } catch (error) {
      UIMessage.error(`Failed to export settings: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleImport: UploadProps['beforeUpload'] = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        importSettings(content);
        UIMessage.success('Settings imported successfully');
      } catch (error) {
        UIMessage.error(`Failed to import settings: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    reader.readAsText(file);
    return false;
  };

  const handleClearData = () => {
    try {
      resetSettings();
      localStorage.clear();
      UIMessage.success('All local data cleared successfully');
    } catch (error) {
      UIMessage.error(`Failed to clear data: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <UISpace direction="vertical" size="large" style={{ width: '100%' }}>

      <UITitle level={5}>Backup & Transfer</UITitle>

      {/* Export Settings */}
      <div>
        <UITitle level={5} style={{ marginBottom: 8 }}>Export Settings</UITitle>
        <UITypographyParagraph type="secondary" style={{ marginBottom: 12 }}>
          Download your current settings as a JSON file. You can use this to backup your preferences
          or transfer them to another device.
        </UITypographyParagraph>
        <UIButton icon={<UIIcon name="DownloadOutlined" />} onClick={handleExport}>
          Export Settings
        </UIButton>
      </div>

      {/* Import Settings */}
      <div>
        <UITitle level={5} style={{ marginBottom: 8 }}>Import Settings</UITitle>
        <UITypographyParagraph type="secondary" style={{ marginBottom: 12 }}>
          Restore your settings from a previously exported JSON file. This will overwrite your current settings.
        </UITypographyParagraph>
        <UIUpload accept=".json" showUploadList={false} beforeUpload={handleImport}>
          <UIButton icon={<UIIcon name="UploadOutlined" />}>Import Settings</UIButton>
        </UIUpload>
      </div>

      {/* Danger Zone */}
      <div
        style={{
          marginTop: 8,
          padding: token.paddingLG,
          borderRadius: token.borderRadius,
          border: `1px solid ${token.colorErrorBorder}`,
          background: token.colorErrorBg,
        }}
      >
        <UITitle level={5} style={{ color: token.colorError, marginBottom: 4 }}>
          <UIIcon name="WarningOutlined" style={{ marginRight: 8 }} />
          Danger Zone
        </UITitle>
        <UITypographyParagraph type="secondary" style={{ marginBottom: 16 }}>
          These actions are irreversible. Please proceed with caution.
        </UITypographyParagraph>

        <div>
          <UITitle level={5} style={{ marginBottom: 8 }}>Clear Local Data</UITitle>
          <UITypographyParagraph type="secondary" style={{ marginBottom: 12 }}>
            Clear all locally stored data including settings, cache, and preferences.
            This will reset the application to its default state.
          </UITypographyParagraph>
          <UIPopconfirm
            title="Clear all local data?"
            description="This will reset all settings to defaults and cannot be undone."
            onConfirm={handleClearData}
            okText="Clear"
            okButtonProps={{ danger: true }}
          >
            <UIButton icon={<UIIcon name="DeleteOutlined" />} variant="primary" danger>
              Clear All Data
            </UIButton>
          </UIPopconfirm>
        </div>
      </div>

    </UISpace>
  );
}
