import { isInput } from './protocol';
import type { Output } from './protocol';
import { initialize } from './runtime';
import type { IRuntime } from './runtime';

let runtime: IRuntime | null = null;
let pending: Promise<void> = Promise.resolve();

function reply(output: Output): void {
  self.postMessage(output);
}

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  const input = event.data;
  if (!isInput(input)) {
    throw new Error('Invalid compiler request.');
  }
  // Async initialization and synchronous LLVM calls share one ordered queue.
  pending = pending.then(async () => {
    try {
      if (input.kind === 'initialize') {
        runtime = await initialize(input.base);
        reply({ kind: 'ready', id: input.id, info: runtime.info });
      } else {
        if (!runtime) {
          throw new Error('The compiler is not initialized.');
        }
        const result = runtime.compile(input.request);
        reply({ kind: 'result', id: input.id, result });
      }
    } catch (error) {
      runtime = null;
      reply({
        kind: 'error',
        id: input.id,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
});
