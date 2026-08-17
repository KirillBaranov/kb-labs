import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { UISkeletonText } from './UISkeleton';

describe('UISkeletonText', () => {
  // Regression guard: `styles.skeletonText` used to resolve to undefined in
  // the published dist bundle (tsup/esbuild has no built-in CSS Modules
  // support), so the shimmer `@keyframes skeletonLoading` animation from
  // UISkeleton.module.css was dead code — no element ever carried the class
  // that references it. See
  // docs/adr/0040-real-css-modules-for-tsup-built-libraries.md.
  it('applies the CSS Modules class carrying the shimmer animation', () => {
    const { container } = render(<UISkeletonText />);
    const bar = container.querySelector('span > span');
    expect(bar).not.toBeNull();
    expect(bar!.className).toContain('skeletonText');
  });

  it('renders one bar per width when given an array of widths', () => {
    const { container } = render(<UISkeletonText width={['100%', '85%', '60%']} />);
    const bars = Array.from(container.querySelectorAll('span > span'));
    expect(bars).toHaveLength(3);
    for (const bar of bars) {
      expect(bar.className).toContain('skeletonText');
    }
  });
});
