import preset from '@kb-labs/devkit/vitest/node'

export default {
  ...preset,
  test: {
    ...preset.test,
    environment: 'jsdom',
  },
}
