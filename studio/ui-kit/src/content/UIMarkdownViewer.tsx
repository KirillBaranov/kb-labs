/**
 * UIMarkdownViewer component - Markdown content viewer
 *
 * Displays markdown content with syntax highlighting.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { theme } from 'antd';
import { UIBox } from '../primitives/UIBox';

const { useToken } = theme;

export interface UIMarkdownViewerProps {
  /** Markdown content */
  content: string;
  /** Additional CSS class */
  className?: string;
  /** Additional styles */
  style?: React.CSSProperties;
}

/**
 * UIMarkdownViewer - Markdown content viewer
 *
 * Note: This is a basic implementation. For production use, consider:
 * - react-markdown for full markdown parsing
 * - rehype-highlight for syntax highlighting
 * - rehype-sanitize for XSS protection
 *
 * @example
 * ```tsx
 * <UIMarkdownViewer content={markdownText} />
 *
 * <UIMarkdownViewer
 *   content="# Hello World\n\nThis is **bold** text"
 * />
 * ```
 */
export function UIMarkdownViewer({
  content,
  className,
  style: customStyle,
}: UIMarkdownViewerProps) {
  const { token } = useToken();

  const style: React.CSSProperties = {
    padding: token.padding,
    backgroundColor: token.colorBgContainer,
    borderRadius: token.borderRadius,
    border: `1px solid ${token.colorBorder}`,
    lineHeight: 1.6,
    ...customStyle,
  };

  // Basic markdown styles
  const markdownStyles: React.CSSProperties = {
    fontFamily: token.fontFamily,
    fontSize: token.fontSize,
    color: token.colorText,
  };

  return (
    <UIBox className={className} style={style}>
      <div
        style={markdownStyles}
        dangerouslySetInnerHTML={{ __html: convertBasicMarkdown(content) }}
      />
    </UIBox>
  );
}

/**
 * Basic markdown to HTML converter
 * For production, use react-markdown or marked.js
 */
function convertBasicMarkdown(markdown: string): string {
  let html = markdown;

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Code
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Line breaks
  html = html.replace(/\n/g, '<br />');

  return html;
}
