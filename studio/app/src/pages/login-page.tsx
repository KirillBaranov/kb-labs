/**
 * @module @kb-labs/studio-app/pages/login-page
 * Login page placeholder - mock authentication
 */

import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UICard, UIButton, UISpace, UITitle, UITypographyText, UITypographyParagraph,
  UISelect, UIDivider, UIMessage, UIIcon,
} from '@kb-labs/studio-ui-kit';
import { useAuth, type UserRole } from '@/providers/auth-provider';

export function LoginPage() {
  const navigate = useNavigate();
  const { setRole } = useAuth();
  const [selectedRole, setSelectedRole] = React.useState<UserRole>('operator');

  const handleLogin = () => {
    setRole(selectedRole);
    navigate('/');
  };

  const handleSSOLogin = () => {
    UIMessage.info('SSO аутентификация будет реализована позже');
    // TODO: Implement SSO authentication
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: 'var(--bg-tertiary)',
        padding: '2rem',
      }}
    >
      <UICard
        style={{
          maxWidth: '480px',
          width: '100%',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
        styles={{ body: { padding: '3rem' } }}
      >
        <UISpace direction="vertical" size="large" style={{ width: '100%', textAlign: 'center' }}>
          {/* Logo */}
          <div
            style={{
              width: '80px',
              height: '80px',
              margin: '0 auto',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '40px',
            }}
          >
            <UIIcon name="RocketOutlined" style={{ color: 'white' }} />
          </div>

          {/* Title */}
          <div>
            <UITitle level={2} style={{ marginBottom: 8 }}>
              KB Labs Studio
            </UITitle>
            <UITypographyText type="secondary">Добро пожаловать в платформу</UITypographyText>
          </div>

          <UIDivider style={{ margin: '8px 0' }} />

          {/* Mock Auth Notice */}
          <div
            style={{
              padding: '16px',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '8px',
              border: '1px solid var(--border-primary)',
            }}
          >
            <UISpace direction="vertical" size="small" style={{ width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UIIcon name="LockOutlined" style={{ color: '#667eea' }} />
                <UITypographyText strong style={{ color: '#667eea' }}>
                  Режим разработки
                </UITypographyText>
              </div>
              <UITypographyParagraph
                type="secondary"
                style={{ margin: 0, fontSize: '0.875rem', textAlign: 'left' }}
              >
                Это заглушка для входа. Выберите роль и войдите без пароля.
              </UITypographyParagraph>
            </UISpace>
          </div>

          {/* Role Selector */}
          <div style={{ width: '100%', textAlign: 'left' }}>
            <UITypographyText strong style={{ display: 'block', marginBottom: 8 }}>
              Выберите роль:
            </UITypographyText>
            <UISelect
              value={selectedRole}
              onChange={(v) => setSelectedRole(v as UserRole)}
              style={{ width: '100%' }}
              size="large"
              options={[
                {
                  label: 'Viewer — Просмотр данных',
                  value: 'viewer',
                },
                {
                  label: 'Operator — Управление системой',
                  value: 'operator',
                },
                {
                  label: 'Admin — Полный доступ',
                  value: 'admin',
                },
              ]}
            />
          </div>

          {/* Login Buttons */}
          <UISpace direction="vertical" size="middle" style={{ width: '100%' }}>
            <UIButton
              variant="primary"
              size="large"
              block
              icon={<UIIcon name="RocketOutlined" />}
              onClick={handleLogin}
              style={{
                height: '48px',
                fontSize: '16px',
                fontWeight: 500,
              }}
            >
              Войти в систему
            </UIButton>

            <UIDivider style={{ margin: '8px 0' }}>
              <UITypographyText type="secondary" style={{ fontSize: '0.75rem' }}>
                или
              </UITypographyText>
            </UIDivider>

            <UIButton
              size="large"
              block
              icon={<UIIcon name="SafetyOutlined" />}
              onClick={handleSSOLogin}
              style={{
                height: '48px',
                fontSize: '16px',
                fontWeight: 500,
              }}
            >
              Войти через SSO
            </UIButton>
          </UISpace>

          {/* Footer */}
          <div style={{ marginTop: '16px' }}>
            <UITypographyText type="secondary" style={{ fontSize: '0.75rem' }}>
              © 2025 KB Labs Studio. Development Preview.
            </UITypographyText>
          </div>
        </UISpace>
      </UICard>
    </div>
  );
}
