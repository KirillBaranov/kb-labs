import { UIEmptyState, UIButton, UIFlex } from '@kb-labs/studio-ui-kit';
import { PlusOutlined } from '@ant-design/icons';

interface DashboardEmptyProps {
  onAddWidget: () => void;
}

export function DashboardEmpty({ onAddWidget }: DashboardEmptyProps) {
  return (
    <UIFlex align="center" justify="center" style={{ minHeight: '400px' }}>
      <UIEmptyState
        useDefaultImage
        description="No widgets added yet"
        action={
          <UIButton variant="primary" icon={<PlusOutlined />} onClick={onAddWidget}>
            Add Widget
          </UIButton>
        }
      />
    </UIFlex>
  );
}
