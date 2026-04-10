import React, { useEffect, useState } from 'react';
import { UICard, UIStatistic } from '@kb-labs/studio-ui-kit';
import './AnimatedMetricCard.css';

export interface AnimatedMetricCardProps {
  title: string;
  value: number;
  previousValue?: number;
  suffix?: string;
  prefix?: string;
  precision?: number;
  icon?: React.ReactNode;
  color?: string;
  animationDuration?: number; // ms
  loading?: boolean;
}

export function AnimatedMetricCard({
  title,
  value,
  previousValue,
  suffix,
  prefix,
  precision = 0,
  icon,
  color = 'var(--info)',
  animationDuration = 1000,
  loading = false,
}: AnimatedMetricCardProps) {
  const [displayValue, setDisplayValue] = useState(previousValue ?? value);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (value === displayValue) {return;}

    setIsAnimating(true);
    const startValue = displayValue;
    const endValue = value;
    const startTime = Date.now();
    const duration = animationDuration;

    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (easeOutCubic)
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (endValue - startValue) * eased;

      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
      }
    };

    requestAnimationFrame(animate);
  }, [value, animationDuration, displayValue]);

  const hasChange = previousValue !== undefined && previousValue !== value;
  const changePercent = hasChange ? ((value - previousValue!) / previousValue!) * 100 : 0;
  const isIncrease = changePercent > 0;

  return (
    <UICard
      variant="borderless"
      className={`animated-metric-card ${isAnimating ? 'animating' : ''}`}
      style={{
        borderLeft: `4px solid ${color}`,
        transition: 'all 0.3s ease',
      }}
      loading={loading}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ flex: 1 }}>
          <UIStatistic
            title={title}
            value={displayValue}
            precision={precision}
            suffix={suffix}
            prefix={prefix}
            valueStyle={{
              fontSize: 32,
              fontWeight: 600,
              color,
              transition: 'color 0.3s ease',
            }}
          />
          {hasChange && (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: isIncrease ? 'var(--success)' : 'var(--error)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>{isIncrease ? '↑' : '↓'}</span>
              <span>{Math.abs(changePercent).toFixed(1)}%</span>
              <span style={{ color: 'var(--text-tertiary)' }}>from previous</span>
            </div>
          )}
        </div>
        {icon && (
          <div
            style={{
              fontSize: 48,
              color,
              opacity: 0.2,
              transition: 'opacity 0.3s ease',
            }}
            className="metric-icon"
          >
            {icon}
          </div>
        )}
      </div>
    </UICard>
  );
}
