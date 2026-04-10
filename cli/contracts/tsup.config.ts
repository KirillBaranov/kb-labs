import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  entry: {
    index: 'src/index.ts',
    'command/index': 'src/command/index.ts',
    'context/index': 'src/context/index.ts',
    'presenter/index': 'src/presenter/index.ts',
  },
  dts: true, // ✅ Enable DTS - this package has ZERO dependencies so no circular issues
});
