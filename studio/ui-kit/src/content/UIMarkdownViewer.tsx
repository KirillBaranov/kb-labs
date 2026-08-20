import * as React from 'react';
import { theme } from 'antd';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { UIBox } from '../primitives/UIBox';

const { useToken } = theme;

export interface UIMarkdownViewerProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
}

export function UIMarkdownViewer({ content, className, style: customStyle }: UIMarkdownViewerProps) {
  const { token } = useToken();

  const css = `
    .kb-md { font-size: ${token.fontSize}px; line-height: 1.6; color: ${token.colorText}; font-family: ${token.fontFamily}; }
    .kb-md > *:first-child { margin-top: 0; }
    .kb-md > *:last-child { margin-bottom: 0; }
    .kb-md h1,.kb-md h2,.kb-md h3,.kb-md h4,.kb-md h5,.kb-md h6 { font-weight:600; line-height:1.3; margin:1.2em 0 0.4em; color:${token.colorTextHeading}; }
    .kb-md h1:first-child,.kb-md h2:first-child,.kb-md h3:first-child { margin-top:0; }
    .kb-md h1 { font-size:1.5em; padding-bottom:0.3em; border-bottom:1px solid ${token.colorBorderSecondary}; }
    .kb-md h2 { font-size:1.25em; padding-bottom:0.2em; border-bottom:1px solid ${token.colorBorderSecondary}; }
    .kb-md h3 { font-size:1.1em; }
    .kb-md h4 { font-size:1em; }
    .kb-md p { margin:0.6em 0; }
    .kb-md a { color:${token.colorPrimary}; text-decoration:none; }
    .kb-md a:hover { text-decoration:underline; }
    .kb-md code { font-family:${token.fontFamilyCode}; font-size:0.875em; background:${token.colorFillTertiary}; color:${token.colorTextSecondary}; padding:0.15em 0.4em; border-radius:${token.borderRadiusSM}px; }
    .kb-md pre { background:${token.colorFillQuaternary}; border:1px solid ${token.colorBorderSecondary}; border-radius:${token.borderRadius}px; padding:12px 16px; overflow-x:auto; margin:0.75em 0; }
    .kb-md pre code { background:none; padding:0; font-size:0.85em; color:${token.colorText}; }
    .kb-md ul,.kb-md ol { padding-left:1.5em; margin:0.6em 0; }
    .kb-md ul { list-style: disc; }
    .kb-md ol { list-style: decimal; }
    .kb-md ul ul { list-style: circle; }
    .kb-md ol ol, .kb-md ul ol { list-style: decimal; }
    .kb-md li { margin:0.2em 0; list-style: inherit; }
    .kb-md li::marker { color:${token.colorTextTertiary}; }
    .kb-md blockquote { margin:0.75em 0; padding:0.4em 1em; border-left:4px solid ${token.colorPrimaryBorder}; background:${token.colorFillQuaternary}; color:${token.colorTextSecondary}; border-radius:0 ${token.borderRadiusSM}px ${token.borderRadiusSM}px 0; }
    .kb-md blockquote p { margin:0; }
    .kb-md hr { border:none; border-top:1px solid ${token.colorBorderSecondary}; margin:1.2em 0; }
    .kb-md table { width:100%; border-collapse:collapse; margin:0.75em 0; font-size:0.9em; }
    .kb-md th,.kb-md td { border:1px solid ${token.colorBorderSecondary}; padding:6px 10px; text-align:left; }
    .kb-md th { background:${token.colorFillTertiary}; font-weight:600; }
    .kb-md tr:nth-child(even) td { background:${token.colorFillQuaternary}; }
    .kb-md img { max-width:100%; border-radius:${token.borderRadius}px; }
  `;

  const html = DOMPurify.sanitize(marked.parse(content) as string);

  return (
    <UIBox className={className} style={{ padding: token.padding, ...customStyle }}>
      <style>{css}</style>
      <div
        className="kb-md"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </UIBox>
  );
}
