import { UIDrawer, UITypographyText } from '@kb-labs/studio-ui-kit';

export interface RawManifestDrawerProps {
  open: boolean;
  onClose: () => void;
  pluginRoot: string;
  manifest: unknown;
}

export function RawManifestDrawer({ open, onClose, pluginRoot, manifest }: RawManifestDrawerProps) {
  return (
    <UIDrawer title="Raw Manifest (JSON)" open={open} onClose={onClose} width={640}>
      <div style={{ marginBottom: 12 }}>
        <UITypographyText type="secondary" style={{ fontSize: 12 }}>Plugin root: </UITypographyText>
        <UITypographyText code copyable style={{ fontSize: 12 }}>{pluginRoot}</UITypographyText>
      </div>
      <pre style={{ overflow: 'auto', maxHeight: 'calc(100vh - 160px)', margin: 0 }}>
        {JSON.stringify(manifest, null, 2)}
      </pre>
    </UIDrawer>
  );
}
