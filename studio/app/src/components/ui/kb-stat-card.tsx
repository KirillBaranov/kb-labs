import * as React from 'react';
import { UICard } from '@kb-labs/studio-ui-kit';
import styles from './kb-stat-card.module.css';

export interface KBStatCardProps {
  label: string;
  value: React.ReactNode;
  variant?: 'positive' | 'negative' | 'warning' | 'default';
}

export function KBStatCard({ label, value, variant = 'default' }: KBStatCardProps) {
  return (
    <UICard>
      <div>
        <div className={styles.label}>{label}</div>
        <div className={`${styles.value} ${variant !== 'default' ? styles[variant] : ''}`}>
          {value}
        </div>
      </div>
    </UICard>
  );
}
