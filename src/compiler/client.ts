import { isOutput } from './protocol';
import type { Input, Output } from './protocol';
import type { ICompiler, Info, Request, Result } from './types';

export interface IWorker {
  postMessage(message: Input): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
}

type Pending = {
  resolve(output: Output): void;
  reject(error: Error): void;
};

/** One disposable worker owns the compiler and all of its process state. */
export function createCompiler(
  url: URL,
  create: () => IWorker = () => new Worker(url, { type: 'module' })
): ICompiler {
  let worker: IWorker | null = null;
  let ready: Promise<Info> | null = null;
  let disposed = false;
  let busy = false;
  let sequence = 0;
  let generation = 0;
  const pending = new Map<number, Pending>();

  function stop(error: Error): void {
    generation += 1;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      worker = null;
    }
    ready = null;
    for (const entry of pending.values()) {
      entry.reject(error);
    }
    pending.clear();
  }

  function start(): IWorker {
    if (disposed) {
      throw new Error('The compiler has been disposed.');
    }
    if (worker) {
      return worker;
    }
    const current = create();
    worker = current;
    current.onmessage = event => {
      if (worker !== current) {
        return;
      }
      if (!isOutput(event.data)) {
        stop(new Error('The compiler returned an invalid response.'));
        return;
      }
      const output = event.data;
      const entry = pending.get(output.id);
      if (!entry) {
        return;
      }
      if (output.kind === 'error') {
        stop(new Error(output.message));
      } else {
        pending.delete(output.id);
        entry.resolve(output);
      }
    };
    current.onerror = event => {
      if (worker === current) {
        event.preventDefault();
        stop(new Error(event.message || 'The compiler worker failed.'));
      }
    };
    current.onmessageerror = () => {
      if (worker === current) {
        stop(new Error('The compiler response could not be read.'));
      }
    };
    return current;
  }

  function send(input: Input): Promise<Output> {
    return new Promise((resolve, reject) => {
      const current = start();
      pending.set(input.id, { resolve, reject });
      try {
        current.postMessage(input);
      } catch (error) {
        stop(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  function initialize(): Promise<Info> {
    if (!ready) {
      ready = send({
        kind: 'initialize',
        id: ++sequence,
        base: new URL('.', url).href
      }).then(output => {
        if (output.kind !== 'ready') {
          throw new Error('Expected compiler capabilities.');
        }
        return output.info;
      });
      const attempt = ready;
      void attempt.catch(() => {
        if (ready === attempt) {
          ready = null;
        }
      });
    }
    return ready;
  }

  return {
    initialize,
    async compile(request: Request): Promise<Result> {
      if (busy) {
        throw new Error('A compilation is already in progress.');
      }
      busy = true;
      const current = generation;
      try {
        await initialize();
        if (current !== generation) {
          const error = new Error('Compilation cancelled.');
          error.name = 'AbortError';
          throw error;
        }
        const output = await send({
          kind: 'compile',
          id: ++sequence,
          request
        });
        if (output.kind !== 'result' || output.result.id !== request.id) {
          throw new Error('The compiler response belongs to another request.');
        }
        return output.result;
      } finally {
        busy = false;
      }
    },
    cancel() {
      const error = new Error('Compilation cancelled.');
      error.name = 'AbortError';
      stop(error);
    },
    dispose() {
      disposed = true;
      stop(new Error('The compiler has been disposed.'));
    }
  };
}
