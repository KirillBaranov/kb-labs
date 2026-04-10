import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type UserRole } from '@/providers/auth-provider';
import { UIButton, UISelect, UIMessage } from '@kb-labs/studio-ui-kit';
import { Boxes, ShieldAlert } from 'lucide-react';
import styles from './login-page.module.css';

const ROLE_OPTIONS = [
  { label: 'Viewer — read-only access', value: 'viewer' },
  { label: 'Operator — manage system', value: 'operator' },
  { label: 'Admin — full access', value: 'admin' },
];

export function LoginPage() {
  const navigate = useNavigate();
  const { setRole } = useAuth();
  const [selectedRole, setSelectedRole] = React.useState<UserRole>('operator');

  const handleLogin = () => {
    setRole(selectedRole);
    navigate('/');
  };

  const handleSSOLogin = () => {
    UIMessage.info('SSO authentication will be available in a future release.');
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.logo}>
            <Boxes size={22} />
          </div>
          <h1 className={styles.title}>KB Labs Studio</h1>
          <p className={styles.subtitle}>Development platform</p>
        </div>

        {/* Dev mode notice */}
        <div className={styles.devNotice}>
          <ShieldAlert size={14} className={styles.devNoticeIcon} />
          <span>Development mode — no password required. Select a role to continue.</span>
        </div>

        {/* Form */}
        <div className={styles.form}>
          <div>
            <label className={styles.label}>Role</label>
            <UISelect
              value={selectedRole}
              onChange={(v) => setSelectedRole(v as UserRole)}
              style={{ width: '100%' }}
              options={ROLE_OPTIONS}
            />
          </div>

          <UIButton
            variant="primary"
            size="large"
            block
            onClick={handleLogin}
          >
            Sign in
          </UIButton>

          <div className={styles.divider}>or</div>

          <UIButton size="large" block onClick={handleSSOLogin}>
            Continue with SSO
          </UIButton>
        </div>

        {/* Footer */}
        <p className={styles.footer}>© 2025 KB Labs · Development Preview</p>
      </div>
    </div>
  );
}
