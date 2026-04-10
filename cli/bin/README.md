# @kb-labs/cli-bin

Entry point for the `kb` CLI binary.

## Overview

Thin wrapper that wires the `kb` binary to the CLI execution pipeline. Contains the `run()` function used by the bin entry point and delegates to `cli-runtime` + `cli-commands` for all logic.

## Usage

### As binary

```bash
kb --help
kb --version
kb plugins ls
kb health
kb config get ai-review
```

### Programmatic

```typescript
import { run } from '@kb-labs/cli-bin';

const exitCode = await run(['plugins', 'ls', '--json']);
process.exit(exitCode ?? 0);
```

## How It Works

```
bin.ts (process.argv)
    │
    └──► run(argv)
             │
             └──► executeCli(argv)        [cli-runtime/bootstrap]
                      │
                      ├──► parseArgs()    [cli-core]
                      ├──► findCommand()  [cli-commands]
                      └──► command.run()  [plugin handler or built-in]
```

The binary itself has no logic — all command routing, middleware, and formatting happens in `cli-runtime`, `cli-core`, and `cli-commands`.

## License

KB Public License v1.1 © KB Labs
