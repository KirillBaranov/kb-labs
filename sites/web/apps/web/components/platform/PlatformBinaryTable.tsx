'use client';

import { usePlatform, OS } from '@/hooks/usePlatform';
import s from './platform.module.css';

export interface BinaryEntry {
  platform: string;
  file: string;
  /** When true, download link is hidden and platform is shown as not supported */
  unsupported?: boolean;
}

interface Props {
  binaries: BinaryEntry[];
  downloadLabel?: string;
  baseUrl: string;
  /** Column header labels */
  colPlatform?: string;
  colBinary?: string;
  colDownload?: string;
}

const OS_KEYWORDS: Record<OS, string[]> = {
  mac: ['darwin', 'macos', 'mac'],
  linux: ['linux'],
  windows: ['windows'],
};

function matchesOS(file: string, os: OS): boolean {
  return OS_KEYWORDS[os].some((kw) => file.toLowerCase().includes(kw));
}

/**
 * Binary download table that highlights the row matching the user's platform.
 */
export function PlatformBinaryTable({
  binaries,
  downloadLabel = 'Download',
  baseUrl,
  colPlatform = 'Platform',
  colBinary = 'Binary',
  colDownload = 'Download',
}: Props) {
  const os = usePlatform();

  return (
    <div className={s.table}>
      <div className={s.tableHead}>
        <span>{colPlatform}</span>
        <span>{colBinary}</span>
        <span>{colDownload}</span>
      </div>
      {binaries.map((item) => {
        const highlighted = os !== null && !item.unsupported && matchesOS(item.file, os);
        return (
          <div
            key={item.file}
            className={[s.tableRow, highlighted ? s.tableRowHighlighted : '', item.unsupported ? s.tableRowUnsupported : ''].filter(Boolean).join(' ')}
          >
            <span>
              {highlighted && <span className={s.platformBadge}>your platform</span>}
              {item.platform}
            </span>
            <code>{item.file}</code>
            {item.unsupported
              ? <span className={s.unsupportedLabel}>not supported yet</span>
              : (
                <a href={`${baseUrl}/${item.file}`} target="_blank" rel="noopener noreferrer">
                  {downloadLabel}
                </a>
              )
            }
          </div>
        );
      })}
    </div>
  );
}
