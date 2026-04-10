import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UIHeader } from './UIHeader';
import { UIButton } from '../core/UIButton';

describe('UIHeader', () => {
  it('renders title', () => {
    render(<UIHeader title="Dashboard" />);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(<UIHeader title="Dashboard" subtitle="Overview of your workspace" />);
    expect(screen.getByText('Overview of your workspace')).toBeInTheDocument();
  });

  it('renders breadcrumb when provided', () => {
    const breadcrumb = <div data-testid="breadcrumb">Home / Dashboard</div>;
    render(<UIHeader title="Dashboard" breadcrumb={breadcrumb} />);
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });

  it('renders actions when provided', () => {
    render(
      <UIHeader
        title="Dashboard"
        actions={<UIButton>Create</UIButton>}
      />
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });

  it('renders title without subtitle', () => {
    render(<UIHeader title="Settings" />);
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByText('subtitle')).not.toBeInTheDocument();
  });
});
