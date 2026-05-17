import * as React from 'react';
import { UIDivider, UITitle, UIIcon } from '@kb-labs/studio-ui-kit';
import { RoleSwitcher } from '@/components/role-switcher';
import { NotificationsSettings } from './notifications-settings';

export function AccountSettings() {
  return (
    <div>
      <RoleSwitcher />
      <UIDivider />
      <UITitle level={4} style={{ marginBottom: 16 }}>
        <UIIcon name="BellOutlined" style={{ marginRight: 8 }} />
        Notifications
      </UITitle>
      <NotificationsSettings />
    </div>
  );
}
