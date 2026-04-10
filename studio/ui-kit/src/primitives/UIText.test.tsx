import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UIText } from './UIText';

describe('UIText', () => {
  it('renders text content', () => {
    render(<UIText>Hello World</UIText>);
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('applies size variants', () => {
    const { container } = render(<UIText size="lg">Large Text</UIText>);
    const element = container.firstChild as HTMLElement;
    expect(element).toHaveStyle({ fontSize: expect.any(String) });
  });

  it('applies color variants', () => {
    const { container } = render(<UIText color="success">Success</UIText>);
    const element = container.firstChild as HTMLElement;
    expect(element).toHaveStyle({ color: 'rgb(82, 196, 26)' });
  });

  it('renders as different HTML elements', () => {
    const { container } = render(<UIText as="p">Paragraph</UIText>);
    expect(container.querySelector('p')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<UIText className="custom">Text</UIText>);
    expect(container.firstChild).toHaveClass('custom');
  });
});
