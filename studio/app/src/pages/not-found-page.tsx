import { useNavigate, useLocation } from 'react-router-dom';
import { UIButton } from '@kb-labs/studio-ui-kit';
import { ArrowLeft, Home } from 'lucide-react';

export function NotFoundPage() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary)',
      padding: 24,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{
          fontSize: 96,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: '-4px',
          color: 'var(--border-secondary)',
          fontFamily: 'var(--font-heading)',
          marginBottom: 24,
          userSelect: 'none',
        }}>
          404
        </div>

        <div style={{
          fontSize: 18,
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 8,
        }}>
          Page not found
        </div>

        <div style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          marginBottom: 4,
          lineHeight: 1.5,
        }}>
          The page you're looking for doesn't exist or has been moved.
        </div>

        {location.pathname !== '/' && (
          <div style={{
            fontSize: 11,
            color: 'var(--text-tertiary)',
            marginBottom: 32,
            fontFamily: 'var(--font-mono, monospace)',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 6,
            padding: '4px 10px',
            display: 'inline-block',
            marginTop: 12,
          }}>
            {location.pathname}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 24 }}>
          <UIButton
            variant="primary"
            icon={<Home size={14} />}
            onClick={() => navigate('/')}
          >
            Go home
          </UIButton>
          <UIButton
            icon={<ArrowLeft size={14} />}
            onClick={() => navigate(-1)}
          >
            Go back
          </UIButton>
        </div>
      </div>
    </div>
  );
}
