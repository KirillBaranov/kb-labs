import * as React from 'react';
import { theme } from 'antd';
import { marked } from 'marked';
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
    .kb-md { font-size: ${token.fontSize}px; line-height: 1.75; color: ${token.colorText}; font-family: ${token.fontFamily}; }
    .kb-md h1,.kb-md h2,.kb-md h3,.kb-md h4,.kb-md h5,.kb-md h6 { font-weight:600; line-height:1.3; margin:1.5em 0 0.5em; color:${token.colorTextHeading}; }
    .kb-md h1 { font-size:${token.fontSizeHeading1}px; padding-bottom:0.3em; border-bottom:1px solid ${token.colorBorderSecondary}; }
    .kb-md h2 { font-size:${token.fontSizeHeading2}px; padding-bottom:0.2em; border-bottom:1px solid ${token.colorBorderSecondary}; }
    .kb-md h3 { font-size:${token.fontSizeHeading3}px; }
    .kb-md h4 { font-size:${token.fontSizeHeading4}px; }
    .kb-md p { margin:0.75em 0; }
    .kb-md a { color:${token.colorPrimary}; text-decoration:none; }
    .kb-md a:hover { text-decoration:underline; }
    .kb-md code { font-family:${token.fontFamilyCode}; font-size:0.875em; background:${token.colorFillTertiary}; color:${token.colorTextSecondary}; padding:0.15em 0.4em; border-radius:${token.borderRadiusSM}px; }
    .kb-md pre { background:${token.colorFillQuaternary}; border:1px solid ${token.colorBorderSecondary}; border-radius:${token.borderRadius}px; padding:16px; overflow-x:auto; margin:1em 0; }
    .kb-md pre code { background:none; padding:0; font-size:0.85em; color:${token.colorText}; }
    .kb-md ul,.kb-md ol { padding-left:1.75em; margin:0.75em 0; }
    .kb-md li { margin:0.25em 0; }
    .kb-md blockquote { margin:1em 0; padding:0.5em 1em; border-left:4px solid ${token.colorPrimaryBorder}; background:${token.colorFillQuaternary}; color:${token.colorTextSecondary}; border-radius:0 ${token.borderRadiusSM}px ${token.borderRadiusSM}px 0; }
    .kb-md blockquote p { margin:0; }
    .kb-md hr { border:none; border-top:1px solid ${token.colorBorderSecondary}; margin:1.5em 0; }
    .kb-md table { width:100%; border-collapse:collapse; margin:1em 0; font-size:0.9em; }
    .kb-md th,.kb-md td { border:1px solid ${token.colorBorderSecondary}; padding:8px 12px; text-align:left; }
    .kb-md th { background:${token.colorFillTertiary}; font-weight:600; }
    .kb-md tr:nth-child(even) td { background:${token.colorFillQuaternary}; }
    .kb-md img { max-width:100%; border-radius:${token.borderRadius}px; }
  `;

  return (
    <UIBox className={className} style={{ padding: token.padding, ...customStyle }}>
      <style>{css}</style>
      <div
        className="kb-md"
        dangerouslySetInnerHTML={{ __html: marked(content) as string }}
      />
    </UIBox>
  );
}
