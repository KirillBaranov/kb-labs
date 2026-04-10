/**
 * @module @kb-labs/studio-app/components/role-switcher
 * Mock authentication role switcher for demo purposes
 */

import * as React from 'react';
import {
  UICard, UIRadio, UIRadioGroup, UISpace, UITitle, UITypographyText, UITypographyParagraph,
  UIAlert, UIDivider, UIIcon,
} from '@kb-labs/studio-ui-kit';
import type { UserRole } from '@/providers/auth-provider';
import { useAuth } from '@/providers/auth-provider';

const ROLE_CONFIG: Record<
  UserRole,
  {
    label: string;
    description: string;
    icon: React.ReactElement;
    color: string;
    permissions: string[];
  }
> = {
  viewer: {
    label: 'Viewer',
    description: 'Read-only access to dashboards and reports',
    icon: <UIIcon name="EyeOutlined" />,
    color: '#52c41a',
    permissions: ['View dashboards', 'View analytics', 'View workflows (read-only)'],
  },
  operator: {
    label: 'Operator',
    description: 'Standard user with execution permissions',
    icon: <UIIcon name="ToolOutlined" />,
    color: '#1890ff',
    permissions: [
      'All Viewer permissions',
      'Execute workflows',
      'Manage widgets',
      'Configure settings',
    ],
  },
  admin: {
    label: 'Administrator',
    description: 'Full access to all features and settings',
    icon: <UIIcon name="CrownOutlined" />,
    color: '#ff4d4f',
    permissions: [
      'All Operator permissions',
      'Manage plugins',
      'System configuration',
      'Advanced developer tools',
    ],
  },
};

export function RoleSwitcher() {
  const { role, setRole } = useAuth();

  const handleRoleChange = (newRole: UserRole) => {
    setRole(newRole);
  };

  return (
    <div>
      <UITitle level={4}>
        <UIIcon name="UserOutlined" style={{ marginRight: 8 }} />
        Mock Authentication
      </UITitle>
      <UITypographyParagraph type="secondary">
        This is a demo authentication system for testing different user roles. In production, this
        would be replaced with real authentication (OAuth, JWT, etc.).
      </UITypographyParagraph>

      <UIAlert
        variant="info"
        message="Demo Mode"
        description="No real authentication is performed. Role changes take effect immediately and persist in localStorage."
        showIcon
        style={{ marginBottom: 24 }}
      />

      <UICard>
        <UIRadioGroup
          value={role}
          onChange={(e) => handleRoleChange(e.target.value as UserRole)}
          style={{ width: '100%' }}
        >
          <UISpace direction="vertical" size="large" style={{ width: '100%' }}>
            {(Object.entries(ROLE_CONFIG) as [UserRole, (typeof ROLE_CONFIG)[UserRole]][]).map(
              ([roleId, config]) => (
                <UICard
                  key={roleId}
                  hoverable
                  style={{
                    borderColor: role === roleId ? config.color : undefined,
                    borderWidth: role === roleId ? 2 : 1,
                  }}
                  onClick={() => handleRoleChange(roleId)}
                >
                  <UIRadio value={roleId} style={{ marginBottom: 8 }}>
                    <UISpace>
                      <span style={{ color: config.color, fontSize: 18 }}>{config.icon}</span>
                      <UITypographyText strong style={{ fontSize: 16 }}>
                        {config.label}
                      </UITypographyText>
                      {role === roleId && (
                        <UITypographyText type="success" style={{ fontSize: 12 }}>
                          (Current)
                        </UITypographyText>
                      )}
                    </UISpace>
                  </UIRadio>
                  <UITypographyParagraph type="secondary" style={{ marginLeft: 24, marginBottom: 8 }}>
                    {config.description}
                  </UITypographyParagraph>
                  <UIDivider style={{ margin: '12px 0' }} />
                  <div style={{ marginLeft: 24 }}>
                    <UITypographyText type="secondary" style={{ fontSize: 12 }}>
                      Permissions:
                    </UITypographyText>
                    <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20 }}>
                      {config.permissions.map((permission, idx) => (
                        <li key={idx}>
                          <UITypographyText type="secondary" style={{ fontSize: 12 }}>
                            {permission}
                          </UITypographyText>
                        </li>
                      ))}
                    </ul>
                  </div>
                </UICard>
              )
            )}
          </UISpace>
        </UIRadioGroup>
      </UICard>

      <UIAlert
        variant="success"
        message="Try it out!"
        description="Switch between roles and navigate through the app to see how different permissions affect the UI and available features."
        showIcon
        style={{ marginTop: 24 }}
      />
    </div>
  );
}
