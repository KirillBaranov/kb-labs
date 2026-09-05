// Fixture for the process-tree kill regression test (worker.ts kill()).
//
// Stands in for the real worker-script.ts the same way
// hanging-worker-script.mjs does, but additionally reproduces the real
// production shape found in checks.ts -> node-backend.ts: on 'execute' it
// spawns its OWN child process with `detached: true` (exactly like
// node-backend.ts's governed shell.exec spawn does for e.g. `release clean
// install`), which means that child is the leader of a BRAND NEW process
// group — not a member of this worker's own process group. A kill that only
// SIGKILLs this worker's single PID, or only SIGKILLs this worker's process
// group, will not touch that detached grandchild: it has to be found by
// walking the real OS process tree (ppid chain) instead.
//
// Contract exercised:
//   - sends {type:'ready', pid} on boot
//   - on {type:'execute', requestId, ...}: spawns a detached grandchild
//     (a plain `node -e "setInterval(...)"` that just idles forever), sends
//     its pid back as a {type:'log'} message so the test can assert on it
//     directly, then never resolves — hangs until Worker.kill() fires.
//   - on {type:'health'}: replies {type:'healthOk'}.
import { spawn } from 'node:child_process';

process.send({ type: 'ready', pid: process.pid });

process.on('message', (message) => {
  if (message.type === 'health') {
    process.send({ type: 'healthOk' });
    return;
  }
  if (message.type === 'execute') {
    const { requestId } = message;

    const child = spawn(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000);'],
      { detached: true, stdio: 'ignore' },
    );
    child.unref();

    process.send({
      type: 'log',
      requestId,
      entry: {
        level: 'info',
        message: `spawned detached grandchild pid=${child.pid}`,
        stream: 'stdout',
        lineNo: 1,
        timestamp: new Date().toISOString(),
      },
    });
    // Deliberately never sends a 'result'/'error' — hangs until killed,
    // same as hanging-worker-script.mjs, but now with a real detached
    // grandchild alive underneath it.
    return;
  }
  if (message.type === 'shutdown') {
    process.exit(0);
  }
});
