import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UITag } from './UITag';

describe('UITag', () => {
  it('renders tag content', () => {
    render(<UITag>Active</UITag>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  // Regression guard: UITag.module.css used to be imported for side effects
  // only, with class names hardcoded as literal strings ('kb-ui-tag',
  // 'kb-ui-tag--clickable') to work around tsup/esbuild's lack of CSS
  // Modules support (styles.className was always {}). Now that
  // css-modules-plugin.js fixes the underlying build, the component uses a
  // real `styles` import — this guards against `styles['kb-ui-tag']`
  // silently going back to undefined.
  it('applies the CSS Modules base class', () => {
    render(<UITag>Active</UITag>);
    expect(screen.getByText('Active').className).toContain('kb-ui-tag');
  });

  it('applies the clickable variant class only when onClick is provided', () => {
    const { rerender } = render(<UITag>Plain</UITag>);
    expect(screen.getByText('Plain').className).not.toContain('kb-ui-tag--clickable');

    rerender(<UITag onClick={vi.fn()}>Clickable</UITag>);
    expect(screen.getByText('Clickable').className).toContain('kb-ui-tag--clickable');
  });
});
