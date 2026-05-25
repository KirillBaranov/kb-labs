'use client';

import { usePlatform, OS } from '@/hooks/usePlatform';
import { DataTable } from '@kb-labs/web-site-ui';
import type { DataTableColumn, DataTableRow } from '@kb-labs/web-site-ui';

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
  colPlatform?: string;
  colBinary?: string;
  colDownload?: string;
}

const OS_KEYWORDS: Record<OS, string[]> = {
  mac:     ['darwin', 'macos', 'mac'],
  linux:   ['linux'],
  windows: ['windows'],
};

function matchesOS(file: string, os: OS): boolean {
  return OS_KEYWORDS[os].some((kw) => file.toLowerCase().includes(kw));
}

export function PlatformBinaryTable({
  binaries,
  downloadLabel = 'Download',
  baseUrl,
  colPlatform = 'Platform',
  colBinary = 'Binary',
  colDownload = 'Download',
}: Props) {
  const os = usePlatform();

  const columns: DataTableColumn[] = [
    { key: 'platform', label: colPlatform },
    { key: 'binary',   label: colBinary },
    { key: 'download', label: colDownload, align: 'text-right' },
  ];

  const rows: DataTableRow[] = binaries.map((item) => {
    const highlighted = os !== null && !item.unsupported && matchesOS(item.file, os);
    return {
      key:       item.file,
      highlight: highlighted,
      muted:     item.unsupported,
      cells: {
        platform: (
          <span className="flex items-center gap-2 font-medium text-kb-text">
            {highlighted && (
              <span className="inline-flex rounded-full bg-accent/15 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-accent">
                your platform
              </span>
            )}
            {item.platform}
          </span>
        ),
        binary: (
          <code className="font-mono text-sm text-muted/60">{item.file}</code>
        ),
        download: item.unsupported ? (
          <span className="text-sm text-muted/30">not supported yet</span>
        ) : (
          <a
            href={`${baseUrl}/${item.file}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-accent hover:underline underline-offset-4"
          >
            {downloadLabel} →
          </a>
        ),
      },
    };
  });

  return <DataTable columns={columns} rows={rows} />;
}
