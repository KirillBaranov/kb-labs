/**
 * @module @kb-labs/studio-app/layouts/TwoPane
 * Two Pane layout - flex-based with optional resizer using design tokens
 *
 * Refactored to use Ant Design theme tokens for colors and transitions.
 */

import * as React from 'react';
import { useUITheme } from '@kb-labs/studio-ui-kit';

export interface TwoPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  leftWidth?: string;
  resizable?: boolean;
  minLeftWidth?: string;
  maxLeftWidth?: string;
}

export function TwoPane({
  left,
  right,
  leftWidth = '50%',
  resizable = false,
  minLeftWidth = '20%',
  maxLeftWidth = '80%',
}: TwoPaneProps) {
  const { token } = useUITheme();
  const [leftWidthState, setLeftWidthState] = React.useState(leftWidth);
  const [isResizing, setIsResizing] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const handleMouseDown = () => {
    if (!resizable) {return;}
    setIsResizing(true);
  };

  const handleMouseMove = React.useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) {return;}

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const newLeftWidth = ((e.clientX - rect.left) / rect.width) * 100;

      // Apply min/max constraints
      const min = parseFloat(minLeftWidth);
      const max = parseFloat(maxLeftWidth);
      const clamped = Math.max(min, Math.min(max, newLeftWidth));

      setLeftWidthState(`${clamped}%`);
    },
    [isResizing, minLeftWidth, maxLeftWidth]
  );

  const handleMouseUp = () => {
    setIsResizing(false);
  };

  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove]);

  return (
    <div
      className="widget-two-pane"
      ref={containerRef}
      style={
        {
          '--border-color': token.colorBorder,
          '--link-color': token.colorLink,
          '--transition-duration': `${token.motionDurationMid}`,
        } as React.CSSProperties
      }
    >
      <div
        className="widget-two-pane__left"
        style={
          {
            width: leftWidthState,
            minWidth: minLeftWidth,
            maxWidth: maxLeftWidth,
          } as React.CSSProperties
        }
      >
        {left}
      </div>
      {resizable && (
        <div
          className="widget-two-pane__resizer"
          onMouseDown={handleMouseDown}
          data-resizing={isResizing}
        />
      )}
      <div className="widget-two-pane__right">{right}</div>
      <style>{`
        .widget-two-pane {
          display: flex;
          height: 100%;
          width: 100%;
        }
        .widget-two-pane__left {
          flex-shrink: 0;
          overflow: auto;
          border-right: 1px solid var(--border-color);
        }
        .widget-two-pane__resizer {
          width: 4px;
          background: var(--border-color);
          cursor: col-resize;
          flex-shrink: 0;
          transition: background var(--transition-duration);
        }
        .widget-two-pane__resizer:hover,
        .widget-two-pane__resizer[data-resizing="true"] {
          background: var(--link-color);
        }
        .widget-two-pane__right {
          flex: 1;
          overflow: auto;
        }
      `}</style>
    </div>
  );
}


