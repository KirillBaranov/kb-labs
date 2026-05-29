/**
 * Account settings section.
 * Note: RoleSwitcher (fake demo auth) removed as part of ADR-0020 migration.
 */

import * as React from 'react';
import { UIDivider, UITitle, UIIcon } from '@kb-labs/studio-ui-kit';
import { NotificationsSettings } from './notifications-settings';

export function AccountSettings() {
  return (
    <div>
      <UITitle level={4} style={{ marginBottom: 16 }}>
        <UIIcon name="BellOutlined" style={{ marginRight: 8 }} />
        Notifications
      </UITitle>
      <UIDivider />
      <NotificationsSettings />
    </div>
  );
}
