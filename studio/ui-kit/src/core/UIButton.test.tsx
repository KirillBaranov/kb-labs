import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIButton } from './UIButton';

describe('UIButton', () => {
  it('renders button text', () => {
    render(<UIButton>Click me</UIButton>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('handles click events', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<UIButton onClick={handleClick}>Click me</UIButton>);

    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders with variant', () => {
    render(<UIButton variant="primary">Primary</UIButton>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('disables button when disabled prop is true', () => {
    render(<UIButton disabled>Disabled</UIButton>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows loading state', () => {
    render(<UIButton loading>Loading</UIButton>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('renders with icon', () => {
    render(<UIButton icon={<span>🔥</span>}>With Icon</UIButton>);
    expect(screen.getByRole('button')).toHaveTextContent('With Icon');
  });
});
