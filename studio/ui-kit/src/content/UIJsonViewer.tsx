/**
 * UIJsonViewer component - JSON content viewer
 *
 * Displays JSON data with syntax highlighting and collapsible nodes.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { theme } from 'antd';
import { UIBox } from '../primitives/UIBox';

const { useToken } = theme;

export interface UIJsonViewerProps {
  /** JSON data to display */
  data: any;
  /** Collapsed by default */
  collapsed?: boolean;
  /** Indentation size */
  indent?: number;
  /** Show line numbers */
  showLineNumbers?: boolean;
  /** Additional CSS class */
  className?: string;
  /** Additional styles */
  style?: React.CSSProperties;
}

/**
 * UIJsonViewer - JSON content viewer
 *
 * Note: This is a basic implementation. For production use, consider:
 * - react-json-view for interactive JSON viewer
 * - @uiw/react-json-view for modern alternative
 *
 * @example
 * ```tsx
 * <UIJsonViewer data={jsonData} />
 *
 * <UIJsonViewer
 *   data={{ name: "John", age: 30, active: true }}
 *   collapsed={false}
 *   showLineNumbers
 * />
 *
 * <UIJsonViewer
 *   data={apiResponse}
 *   indent={4}
 * />
 * ```
 */
export function UIJsonViewer({
  data,
  collapsed: _collapsed = false,
  indent = 2,
  showLineNumbers = false,
  className,
  style: customStyle,
}: UIJsonViewerProps) {
  const { token } = useToken();

  // TODO: Implement collapse/expand functionality
  // const [isCollapsed, setIsCollapsed] = React.useState(_collapsed);

  const jsonString = React.useMemo(() => {
    try {
      return JSON.stringify(data, null, indent);
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : 'Invalid JSON'}`;
    }
  }, [data, indent]);

  const lines = jsonString.split('\n');

  const style: React.CSSProperties = {
    backgroundColor: token.colorBgContainer,
    borderRadius: token.borderRadius,
    border: `1px solid ${token.colorBorder}`,
    overflow: 'auto',
    maxHeight: '600px',
    ...customStyle,
  };

  const codeStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
    fontSize: '13px',
    lineHeight: '1.6',
    padding: token.padding,
    margin: 0,
    whiteSpace: 'pre',
    color: token.colorText,
  };

  const lineNumberStyle: React.CSSProperties = {
    display: 'inline-block',
    width: '40px',
    color: token.colorTextSecondary,
    userSelect: 'none',
    textAlign: 'right',
    marginRight: token.marginSM,
  };

  // Syntax highlighting
  const highlightedJson = highlightJson(jsonString, token);

  return (
    <UIBox className={className} style={style}>
      <pre style={codeStyle}>
        {showLineNumbers ? (
          lines.map((line, index) => (
            <div key={index}>
              <span style={lineNumberStyle}>{index + 1}</span>
              <span dangerouslySetInnerHTML={{ __html: highlightJson(line, token) }} />
            </div>
          ))
        ) : (
          <span dangerouslySetInnerHTML={{ __html: highlightedJson }} />
        )}
      </pre>
    </UIBox>
  );
}

/**
 * Basic JSON syntax highlighting
 */
function highlightJson(json: string, token: any): string {
  // String values
  json = json.replace(/"([^"]+)":/g, `<span style="color: ${token.colorPrimary}">"$1"</span>:`);

  // String literals
  json = json.replace(/: "([^"]*)"/g, `: <span style="color: ${token.colorSuccess}">"$1"</span>`);

  // Numbers
  json = json.replace(/: (\d+)/g, `: <span style="color: ${token.colorWarning}">$1</span>`);

  // Booleans
  json = json.replace(/: (true|false)/g, `: <span style="color: ${token.colorInfo}">$1</span>`);

  // Null
  json = json.replace(/: (null)/g, `: <span style="color: ${token.colorTextSecondary}">$1</span>`);

  return json;
}
