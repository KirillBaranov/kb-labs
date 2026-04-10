/**
 * Dependency Graph tab - visualizes package dependencies
 */

import * as React from 'react';
import type { DataNode } from 'antd/es/tree';
import { useData, UICard, UISelect, UISpin, UIAlert, UITree, UIRow, UICol, UIStatistic } from '@kb-labs/sdk/studio';
import type { GraphResponse, BuildOrderResponse, GraphMode, GraphNode } from '@kb-labs/quality-contracts';

export function GraphTab() {
  const [mode, setMode] = React.useState<GraphMode>('stats');
  const [selectedPackage, setSelectedPackage] = React.useState<string | undefined>();

  const { data: buildOrderData } = useData<BuildOrderResponse>('/v1/plugins/quality/build-order');

  // Auto-select first package when switching to modes that require packageName
  React.useEffect(() => {
    if ((mode === 'reverse' || mode === 'impact') && !selectedPackage && buildOrderData?.sorted?.[0]) {
      setSelectedPackage(buildOrderData.sorted[0]);
    }
  }, [mode, selectedPackage, buildOrderData]);

  const graphUrl = selectedPackage
    ? `/v1/plugins/quality/graph?mode=${mode}&package=${encodeURIComponent(selectedPackage)}`
    : `/v1/plugins/quality/graph?mode=${mode}`;

  const { data, isLoading, isError } = useData<GraphResponse>(graphUrl);

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <UISpin size="large" />
      </div>
    );
  }

  if (isError) {
    return <UIAlert message="Failed to load graph" variant="error" showIcon />;
  }

  const convertToTreeData = (node: GraphNode, path: string = ''): DataNode => {
    const key = path ? `${path}/${node.name}` : node.name;
    return {
      title: node.name,
      key,
      children: node.children?.map((child) => convertToTreeData(child, key)),
    };
  };

  const renderTreeMode = () => {
    if (!data?.tree) {
      return <UIAlert message="No tree data available" variant="info" />;
    }
    return (
      <UITree
        treeData={[convertToTreeData(data.tree)]}
        showLine
        defaultExpandedKeys={[data.tree.name]}
      />
    );
  };

  const renderPackagesMode = () => {
    if (!data?.packages || data.packages.length === 0) {
      return <UIAlert message="No packages found" variant="info" />;
    }
    return (
      <ul>
        {data.packages.map((pkg) => (
          <li key={pkg}>{pkg}</li>
        ))}
      </ul>
    );
  };

  const renderStatsMode = () => {
    if (!data?.stats) {
      return <UIAlert message="No stats available" variant="info" />;
    }
    return (
      <div>
        <UIRow gutter={16} style={{ marginBottom: 24 }}>
          <UICol span={8}>
            <UICard>
              <UIStatistic title="Total Packages" value={data.stats.totalPackages} />
            </UICard>
          </UICol>
          <UICol span={8}>
            <UICard>
              <UIStatistic title="Max Depth" value={data.stats.maxDepth} />
            </UICard>
          </UICol>
          <UICol span={8}>
            <UICard>
              <UIStatistic
                title="Avg Dependencies"
                value={data.stats.avgDependencies}
                precision={1}
              />
            </UICard>
          </UICol>
        </UIRow>
        {data.stats.mostDepended && data.stats.mostDepended.length > 0 && (
          <UICard title="Most Depended On">
            <ul>
              {data.stats.mostDepended.map((item) => (
                <li key={item.name}>
                  <strong>{item.name}</strong> - {item.count} packages depend on it
                </li>
              ))}
            </ul>
          </UICard>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Controls */}
      <UICard title="Visualization Options" style={{ marginBottom: 24 }}>
        <UIRow gutter={16}>
          <UICol span={12}>
            <label>Mode:</label>
            <UISelect
              style={{ width: '100%', marginTop: 8 }}
              value={mode}
              onChange={(val) => setMode(val as GraphMode)}
              options={[
                { label: 'Dependency Tree', value: 'tree' },
                { label: 'Reverse Dependencies', value: 'reverse' },
                { label: 'Impact Analysis', value: 'impact' },
                { label: 'Statistics', value: 'stats' },
              ]}
            />
          </UICol>
          {mode !== 'stats' && (
            <UICol span={12}>
              <label>Package{mode === 'tree' ? ' (optional)' : ''}:</label>
              <UISelect
                style={{ width: '100%', marginTop: 8 }}
                placeholder={mode === 'tree' ? 'All packages' : 'Select a package'}
                value={selectedPackage}
                onChange={(val) => setSelectedPackage(val as string | undefined)}
                allowClear
                showSearch
                options={buildOrderData?.sorted?.map((pkg) => ({ label: pkg, value: pkg })) ?? []}
              />
            </UICol>
          )}
        </UIRow>
      </UICard>

      {/* Visualization */}
      <UICard title={`${mode.charAt(0).toUpperCase() + mode.slice(1)} View`}>
        {mode === 'tree' && renderTreeMode()}
        {(mode === 'reverse' || mode === 'impact') && renderPackagesMode()}
        {mode === 'stats' && renderStatsMode()}
      </UICard>
    </div>
  );
}
