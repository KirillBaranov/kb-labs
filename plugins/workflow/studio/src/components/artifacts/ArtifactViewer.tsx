/**
 * Polymorphic artifact viewer.
 * Renders step artifacts based on their declared type.
 */

import { useState } from 'react'
import { UIJsonViewer } from '@kb-labs/sdk/studio'

export interface ArtifactViewerProps {
  type: 'markdown' | 'issues' | 'table' | 'diff' | 'log' | 'json' | 'link'
  data: unknown
  label?: string
  editable?: boolean
  onEdit?: (newValue: unknown) => void
}

// ─── Markdown ────────────────────────────────────────────────────────────────

function MarkdownViewer({ data, editable, onEdit }: { data: unknown; editable?: boolean; onEdit?: (v: unknown) => void }) {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(text)

  if (editing && editable) {
    return (
      <div>
        <textarea
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          style={{
            width: '100%',
            minHeight: 200,
            fontFamily: 'monospace',
            fontSize: 13,
            padding: 12,
            border: '1px solid var(--border-primary)',
            borderRadius: 6,
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            onClick={() => { onEdit?.(editValue); setEditing(false) }}
            style={{
              padding: '4px 12px', fontSize: 13, fontWeight: 500,
              background: 'var(--link)', color: 'var(--text-inverse)',
              border: 'none', borderRadius: 4, cursor: 'pointer',
            }}
          >
            Save
          </button>
          <button
            onClick={() => { setEditValue(text); setEditing(false) }}
            style={{
              padding: '4px 12px', fontSize: 13,
              background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
              border: '1px solid var(--border-primary)', borderRadius: 4, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {editable && (
        <button
          onClick={() => setEditing(true)}
          style={{
            float: 'right', padding: '2px 8px', fontSize: 11,
            background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
            border: '1px solid var(--border-primary)', borderRadius: 4, cursor: 'pointer',
          }}
        >
          Edit
        </button>
      )}
      <pre style={{
        margin: 0, padding: 12, background: 'var(--bg-secondary)',
        borderRadius: 6, fontSize: 13, lineHeight: 1.6,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        color: 'var(--text-primary)', border: '1px solid var(--border-primary)',
      }}>
        {text}
      </pre>
    </div>
  )
}

// ─── Issues ──────────────────────────────────────────────────────────────────

interface Issue {
  file?: string
  line?: number
  severity?: string
  message?: string
  problem?: string
  fix?: string
}

const SEVERITY_COLOR: Record<string, string> = {
  blocker: 'var(--error)',
  high: 'var(--error)',
  medium: 'var(--warning)',
  low: 'var(--text-tertiary)',
  info: 'var(--info)',
}

function IssuesViewer({ data }: { data: unknown }) {
  const issues = Array.isArray(data) ? (data as Issue[]) : []

  if (!issues.length) {
    return <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: 12 }}>No issues found.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {issues.map((issue, i) => {
        const severity = issue.severity ?? 'info'
        const color = SEVERITY_COLOR[severity] ?? 'var(--text-tertiary)'
        return (
          <div key={i} style={{
            padding: '8px 12px', background: 'var(--bg-secondary)',
            border: `1px solid var(--border-primary)`, borderRadius: 6,
            borderLeft: `3px solid ${color}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color, textTransform: 'uppercase' }}>
                {severity}
              </span>
              {issue.file && (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                  {issue.file}{issue.line ? `:${issue.line}` : ''}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
              {issue.message ?? issue.problem ?? JSON.stringify(issue)}
            </div>
            {issue.fix && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, fontStyle: 'italic' }}>
                Fix: {issue.fix}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Table ───────────────────────────────────────────────────────────────────

function TableViewer({ data }: { data: unknown }) {
  const rows = Array.isArray(data) ? data : []
  if (!rows.length) {
    return <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: 12 }}>No data.</div>
  }

  const firstRow = rows[0] as Record<string, unknown>
  const columns = Object.keys(firstRow)

  return (
    <div style={{ overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col} style={{
                padding: '6px 12px', textAlign: 'left', fontWeight: 600,
                borderBottom: '2px solid var(--border-primary)',
                color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase',
              }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const r = row as Record<string, unknown>
            return (
              <tr key={i} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                {columns.map(col => (
                  <td key={col} style={{ padding: '6px 12px', color: 'var(--text-primary)' }}>
                    {String(r[col] ?? '')}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Diff ────────────────────────────────────────────────────────────────────

function DiffViewer({ data }: { data: unknown }) {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  const lines = text.split('\n')

  return (
    <pre style={{
      margin: 0, padding: 12, background: '#0d1117',
      borderRadius: 6, fontSize: 13, lineHeight: 1.6,
      overflow: 'auto', maxHeight: 500,
      color: '#c9d1d9', fontFamily: 'monospace',
    }}>
      {lines.map((line, i) => {
        let color = '#c9d1d9'
        if (line.startsWith('+') && !line.startsWith('+++')) {color = '#3fb950'}
        else if (line.startsWith('-') && !line.startsWith('---')) {color = '#f85149'}
        else if (line.startsWith('@@')) {color = '#79c0ff'}
        return <div key={i} style={{ color }}>{line}</div>
      })}
    </pre>
  )
}

// ─── Log ─────────────────────────────────────────────────────────────────────

function LogViewer({ data }: { data: unknown }) {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)

  return (
    <pre style={{
      margin: 0, padding: 12, background: '#0d1117',
      borderRadius: 6, fontSize: 13, lineHeight: 1.6,
      overflow: 'auto', maxHeight: 400,
      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      color: '#c9d1d9', fontFamily: 'monospace',
    }}>
      {text}
    </pre>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function ArtifactViewer({ type, data, label, editable, onEdit }: ArtifactViewerProps) {
  return (
    <div>
      {label && (
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
          marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          {label}
        </div>
      )}
      {type === 'markdown' && <MarkdownViewer data={data} editable={editable} onEdit={onEdit} />}
      {type === 'issues' && <IssuesViewer data={data} />}
      {type === 'table' && <TableViewer data={data} />}
      {type === 'diff' && <DiffViewer data={data} />}
      {type === 'log' && <LogViewer data={data} />}
      {type === 'json' && <UIJsonViewer data={data} />}
      {type === 'link' && typeof data === 'string' && (
        <a href={data} target="_blank" rel="noreferrer" style={{ color: 'var(--link)' }}>{label ?? data}</a>
      )}
    </div>
  )
}
