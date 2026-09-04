// Minimal stand-in for the real worker-script.ts, used to test Worker's
// (worker.ts) execution-timeout handling in isolation from the full
// plugin-runtime/platform-proxy stack (which the real worker-script.ts
// needs, but which the timeout-handling contract under test doesn't touch).
//
// Contract exercised (see worker.ts):
//   - sends {type:'ready', pid} on boot
//   - on {type:'execute', requestId, ...}: emits a couple of {type:'log'}
//     messages (so lastActivity tracking has something to capture), then
//     never resolves — simulating a hung/runaway handler that only a real
//     kill (not just abandoning the promise) can stop.
//   - on {type:'health'}: replies {type:'healthOk'} so healthCheck() works.
process.send({ type: 'ready', pid: process.pid });

process.on('message', (message) => {
  if (message.type === 'health') {
    process.send({ type: 'healthOk' });
    return;
  }
  if (message.type === 'execute') {
    const { requestId } = message;
    process.send({
      type: 'log',
      requestId,
      entry: {
        level: 'info',
        message: 'installing package 7 of 40',
        stream: 'stdout',
        lineNo: 1,
        timestamp: new Date().toISOString(),
      },
    });
    // Deliberately never sends a 'result'/'error' — hangs until killed.
    return;
  }
  if (message.type === 'shutdown') {
    process.exit(0);
  }
});
