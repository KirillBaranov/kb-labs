import { UIDiffViewer } from '@kb-labs/sdk/studio'

export function DiffViewer({ data }: { data: unknown }) {
  const text = typeof data === 'string' ? data : data == null ? '' : (JSON.stringify(data, null, 2) ?? '')
  if (!text) {return null}
  return <UIDiffViewer diff={text} maxHeight={500} />
}
