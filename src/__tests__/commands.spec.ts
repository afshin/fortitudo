import { CommandRegistry } from '@lumino/commands';

import { CommandIDs, registerCommands } from '../commands';
import type { ICompiler, Result } from '../compiler/types';
import { initial, options, stale } from '../model';
import { createStore } from '../state';

const info = {
  version: 'LLVM 23.1.0',
  resourceDirectory: '/lib/clang/23',
  targets: [options.target]
};

it('routes edits and releases command registrations', async () => {
  const commands = new CommandRegistry();
  const store = createStore(initial());
  let finish: (result: Result) => void = () => {
    throw new Error('not started');
  };
  const compiler: ICompiler = {
    initialize: async () => info,
    compile: () =>
      new Promise(resolve => {
        finish = resolve;
      }),
    cancel: jest.fn(),
    dispose: jest.fn()
  };
  const registered = registerCommands(commands, {
    store,
    compiler,
    resetLayout: jest.fn()
  });
  const running = commands.execute(CommandIDs.compile);
  expect(commands.isEnabled(CommandIDs.compile)).toBe(false);
  expect(commands.isEnabled(CommandIDs.cancel)).toBe(true);
  await Promise.resolve();
  await commands.execute(CommandIDs.source, {
    source: 'edited while compiling'
  });
  finish({
    id: 1,
    assembly: 'assembly',
    diagnostics: [],
    commands: [],
    stdout: '',
    stderr: '',
    exitCode: 0,
    duration: 1
  });
  await running;
  expect(stale(store.state)).toBe(true);
  expect(commands.isEnabled(CommandIDs.compile)).toBe(true);
  registered.dispose();
  expect(commands.hasCommand(CommandIDs.compile)).toBe(false);
  store.dispose();
});

it('keeps cancellation distinct from worker failure', async () => {
  const commands = new CommandRegistry();
  const store = createStore(initial());
  let reject: (error: Error) => void = () => {
    throw new Error('not started');
  };
  const compiler: ICompiler = {
    initialize: () =>
      new Promise((_, failure) => {
        reject = failure;
      }),
    compile: jest.fn(),
    cancel: () => reject(new Error('terminated')),
    dispose: jest.fn()
  };
  const registered = registerCommands(commands, {
    store,
    compiler,
    resetLayout: jest.fn()
  });
  const running = commands.execute(CommandIDs.compile);
  await commands.execute(CommandIDs.cancel);
  await running;
  expect(store.state.status).toBe('cancelled');
  expect(store.state.notice).toBeNull();
  registered.dispose();
});
