'use strict';
// No-op adapter — present only to exercise the pnpm install + release.json
// path. The test gateway does not actually invoke any platform.X, so this
// module exports a sentinel and nothing more.
module.exports = { kind: 'adapter-noop', version: '1.0.0' };
