import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIInput } from './UIInput';

describe('UIInput', () => {
  it('renders input field', () => {
    render(<UIInput placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  it('handles value changes', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(<UIInput onChange={handleChange} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'Hello');

    expect(handleChange).toHaveBeenCalled();
    expect(handleChange).toHaveBeenLastCalledWith('Hello'); // Full value
  });

  it('displays default value', () => {
    render(<UIInput defaultValue="Default" />);
    expect(screen.getByRole('textbox')).toHaveValue('Default');
  });

  it('disables input when disabled prop is true', () => {
    render(<UIInput disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('applies maxLength constraint', () => {
    render(<UIInput maxLength={10} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('maxLength', '10');
  });
});
