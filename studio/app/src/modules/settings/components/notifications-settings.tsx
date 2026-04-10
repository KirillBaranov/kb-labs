import * as React from 'react';
import { UIForm, UIFormItem, UISwitch, UISpace, UIAlert, UIIcon } from '@kb-labs/studio-ui-kit';

export function NotificationsSettings() {
  return (
    <UISpace direction="vertical" size="large" style={{ width: '100%' }}>
      <UIAlert
        message="Feature in Development"
        description="Notification preferences will be configurable soon. We're working on bringing you more control over alerts and notifications."
        variant="warning"
        showIcon
        icon={<UIIcon name="BellOutlined" />}
      />

      <div style={{ opacity: 0.5, pointerEvents: 'none' }}>
        <UIForm layout="vertical">
          <UIFormItem label="Toast Notifications" help="Show temporary notification popups">
            <UISwitch disabled defaultChecked />
          </UIFormItem>

          <UIFormItem label="Sound Alerts" help="Play sounds for important events">
            <UISwitch disabled />
          </UIFormItem>

          <UIFormItem label="Desktop Notifications" help="Enable browser notifications (requires permission)">
            <UISwitch disabled />
          </UIFormItem>

          <UIFormItem label="Email Digest" help="Receive daily summary emails">
            <UISwitch disabled />
          </UIFormItem>

          <UIFormItem label="Error Notifications" help="Get notified when errors occur">
            <UISwitch disabled defaultChecked />
          </UIFormItem>
        </UIForm>
      </div>
    </UISpace>
  );
}
