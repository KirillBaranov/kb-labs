import * as React from 'react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { UIBadge } from '@kb-labs/studio-ui-kit';
import { useDevToolsStore } from '@/hooks/use-devtools-store';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { DevToolsLogFeed } from './devtools-log-feed';
import styles from './devtools-panel.module.css';

const MIN_HEIGHT = 120;
const DEFAULT_HEIGHT = 280;

export function DevToolsPanel() {
  const { isEnabled } = useFeatureFlags();
  if (!isEnabled('devtools-panel')) {return null;}
  return <DevToolsPanelInner />;
}

function DevToolsPanelInner() {
  const { channels } = useDevToolsStore();
  const [open, setOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);

  const errorCount = React.useMemo(() => {
    let count = 0;
    channels.forEach((ch) => {
      (ch.getEvents() as Array<{ status?: string }>).forEach((e) => {
        if (e.status === 'error' || e.status === 'warning') {count++;}
      });
    });
    return count;
  }, [channels]);

  // ── Drag to resize ──────────────────────────────────────────────────────
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: height };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) {return;}
      const delta = dragRef.current.startY - ev.clientY;
      setHeight(Math.max(MIN_HEIGHT, dragRef.current.startH + delta));
      setMaximized(false);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [height]);

  // ── Keyboard shortcut: Ctrl+Shift+D ────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const panelHeight = maximized ? 'calc(100vh - 48px)' : height;
  const toggleBottom = open ? (maximized ? 'calc(100vh - 48px)' : height) : 0;

  return (
    <>
      {/* Toggle button */}
      <button
        className={`${styles.toggleBtn} ${open ? styles.open : ''}`}
        style={{ bottom: toggleBottom }}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`${styles.toggleArrow} ${open ? styles.arrowDown : styles.arrowUp}`} />
        <span>DevTools</span>
        {errorCount > 0 && <UIBadge count={errorCount} size="small" style={{ marginLeft: 2 }} />}
      </button>

      {/* Floating panel */}
      {open && (
        <div className={styles.panel} style={{ height: panelHeight }}>
          <div className={styles.dragHandle} onMouseDown={onResizeMouseDown}>
            <div className={styles.dragGrip} />
          </div>

          <div className={styles.topBar}>
            <button
              className={styles.iconBtn}
              onClick={() => setMaximized((v) => !v)}
              title={maximized ? 'Restore' : 'Maximize'}
            >
              {maximized ? '⊡' : '⊞'}
            </button>
            <button
              className={styles.iconBtn}
              onClick={() => setOpen(false)}
              title="Close (Ctrl+Shift+D)"
            >
              ✕
            </button>
          </div>

          <div className={styles.content}>
            <DevToolsLogFeed />
          </div>
        </div>
      )}
    </>
  );
}
