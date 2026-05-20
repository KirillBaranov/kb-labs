import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatTable } from '../table';
import { createBaseStdoutUI, NOOP_PROMPTS } from '../stdout-ui';

describe('formatTable', () => {
  describe('visualWidth — dingbats and BMP symbols are single-width', () => {
    it('treats ✓ ✗ ◆ ○ as width 1 (not 2)', () => {
      const lines = formatTable(
        [{ header: 'S' }, { header: 'Name' }],
        [['✓', 'foo'], ['✗', 'bar'], ['◆', 'baz'], ['○', 'qux']],
        { separator: '' },
      );
      // col0: max(1, 1, 1, 1, 1) = 1 — dingbats must not inflate to 2
      // col1: max(4, 3, 3, 3, 3) = 4
      expect(lines[0]).toBe('S Name');
      expect(lines[1]).toBe('✓ foo ');
      expect(lines[2]).toBe('✗ bar ');
      expect(lines[3]).toBe('◆ baz ');
      expect(lines[4]).toBe('○ qux ');
    });

    it('still counts CJK characters as width 2', () => {
      const lines = formatTable(
        [{ header: 'X' }],
        [['中']],
        { separator: '' },
      );
      // '中' is double-width → col width = max(1, 2) = 2
      // header 'X' padded to 2: 'X '
      expect(lines[0]).toBe('X ');
      expect(lines[1]).toBe('中');
    });

    it('still counts high-plane emoji as width 2', () => {
      const lines = formatTable(
        [{ header: 'E' }],
        [['🚀']],
        { separator: '' },
      );
      // 🚀 U+1F680 is double-width → col width = 2
      expect(lines[0]).toBe('E ');
      expect(lines[1]).toBe('🚀');
    });
  });

  describe('explicit column width', () => {
    it('respects width: 1 on icon column — header padded to 1, not auto-calculated', () => {
      // Regression: before fix, stdout-ui dropped `width` so formatTable would
      // see visualWidth('✓')=2 and make the column width=2, shifting all columns.
      const lines = formatTable(
        [{ header: ' ', width: 1 }, { header: 'Workflow' }],
        [['✓', 'test-stream'], ['✗', 'other-run']],
        { separator: '' },
      );
      // col0 forced to 1 → header ' ' stays 1 char wide
      // col1: max(8, 11, 9) = 11
      expect(lines[0]).toBe('  Workflow   ');  // ' '(1) + ' '(pad) + 'Workflow   '(11)
      expect(lines[1]).toBe('✓ test-stream');
      expect(lines[2]).toBe('✗ other-run  ');
    });
  });
});

describe('createBaseStdoutUI — table width passthrough', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('passes explicit column width through to formatTable', () => {
    // Regression: stdout-ui previously dropped the `width` field when mapping
    // columns, ignoring explicit widths set by callers (e.g. width:1 icon column).
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => { logged.push(args.join('')); });

    const ui = createBaseStdoutUI(NOOP_PROMPTS, () => {});
    ui.table!(
      [
        { ' ': '✓', Workflow: 'test-stream' },
        { ' ': '✗', Workflow: 'other-run' },
      ],
      [
        { header: ' ', key: ' ', width: 1 },
        { header: 'Workflow', key: 'Workflow' },
      ],
    );

    // stdout-ui prefixes every line with '  '
    // col0 width=1 → header ' '(1), data '✓'/'✗' (both 1 wide in terminal)
    // col1 width=11 → 'Workflow   ', 'test-stream', 'other-run  '
    expect(logged[0]).toBe('    Workflow   ');    // header: '  ' + ' ' + ' ' + 'Workflow   '
    expect(logged[1]).toBe('  ✓ test-stream');
    expect(logged[2]).toBe('  ✗ other-run  ');
  });
});
