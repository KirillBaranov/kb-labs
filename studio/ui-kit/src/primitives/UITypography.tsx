/**
 * UITypography components - Rich text display
 *
 * Wraps Ant Design Typography.Text, Typography.Paragraph, Typography.Link
 * for features like copyable, ellipsis, editable, etc.
 *
 * For simple styled text, use UIText instead (design-token-based).
 */

import * as React from 'react';
import { Typography } from 'antd';
import type { TextProps } from 'antd/es/typography/Text';
import type { ParagraphProps } from 'antd/es/typography/Paragraph';
import type { LinkProps } from 'antd/es/typography/Link';

export interface UITypographyTextProps extends TextProps {}
export interface UITypographyParagraphProps extends ParagraphProps {}
export interface UITypographyLinkProps extends LinkProps {}

export function UITypographyText(props: UITypographyTextProps) {
  return <Typography.Text {...props} />;
}

export function UITypographyParagraph(props: UITypographyParagraphProps) {
  return <Typography.Paragraph {...props} />;
}

export function UITypographyLink(props: UITypographyLinkProps) {
  return <Typography.Link {...props} />;
}
