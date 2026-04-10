import preset from '@kb-labs/devkit/vitest/node'

export default {
  ...preset,
  test: {
    ...preset.test,
    // Override environment for specific test files (devkit-specific)
    environmentMatchGlobs: [
      ['**/fixtures/web/**/*.{test,spec}.?(c|m)[jt]s?(x)', 'jsdom']
    ],
  },
}
