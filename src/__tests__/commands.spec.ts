import { CommandRegistry } from '@lumino/commands';

import { CommandIDs, registerCommands } from '../commands';
import type { ICommandContext } from '../commands';
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
  const activatePane = jest.fn();
  let finish: (result: Result) => void = () => {
    throw new Error('not started');
  };
  const compiler: ICompiler = {
    initialize: async () => info,
    command: jest.fn(),
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
    activatePane,
    copy: jest.fn(),
    download: jest.fn(),
    runner: { run: jest.fn(), reset: jest.fn(), dispose: jest.fn() }
  });
  const running = commands.execute(CommandIDs.compile);
  expect(commands.isEnabled(CommandIDs.compile)).toBe(false);
  expect(commands.isEnabled(CommandIDs.cancel)).toBe(true);
  await Promise.resolve();
  await commands.execute(CommandIDs.setSource, {
    source: 'edited while compiling'
  });
  finish({
    id: 1,
    sourcePath: '/workspace/snippet.cpp',
    artifacts: [],
    stages: [],
    files: [],
    diagnostics: [],
    commands: [],
    stdout: '',
    stderr: '',
    exitCode: 1,
    duration: 1
  });
  await running;
  expect(stale(store.state)).toBe(true);
  expect(activatePane).not.toHaveBeenCalled();
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
    initialize: onProgress => {
      onProgress?.({ phase: 'preparing' });
      return new Promise((_, failure) => {
        reject = failure;
      });
    },
    command: jest.fn(),
    compile: jest.fn(),
    cancel: () => reject(new Error('terminated')),
    dispose: jest.fn()
  };
  const registered = registerCommands(commands, {
    store,
    compiler,
    activatePane: jest.fn(),
    copy: jest.fn(),
    download: jest.fn(),
    runner: { run: jest.fn(), reset: jest.fn(), dispose: jest.fn() }
  });
  const running = commands.execute(CommandIDs.compile);
  expect(store.state.progress).toEqual({ phase: 'preparing' });
  await commands.execute(CommandIDs.cancel);
  await running;
  expect(store.state.status).toBe('cancelled');
  expect(store.state.notice).toBeNull();
  expect(store.state.progress).toBeNull();
  registered.dispose();
});

function context(): ICommandContext {
  return {
    store: createStore(initial()),
    compiler: {
      initialize: async () => info,
      compile: jest.fn(),
      command: jest.fn(),
      cancel: jest.fn(),
      dispose: jest.fn()
    },
    runner: { run: jest.fn(), reset: jest.fn(), dispose: jest.fn() },
    activatePane: jest.fn(),
    copy: jest.fn(),
    download: jest.fn()
  };
}

it('selects outputs and rejects invalid selections', async () => {
  const commands = new CommandRegistry();
  const services = context();
  const registered = registerCommands(commands, services);
  try {
    await commands.execute(CommandIDs.selectOutput, { output: 'ir' });
    expect(services.store.state.output).toBe('ir');
    await expect(
      commands.execute(CommandIDs.selectOutput, { output: 'invalid' })
    ).rejects.toThrow('Invalid output selection.');
    expect(services.store.state.output).toBe('ir');
  } finally {
    registered.dispose();
    services.store.dispose();
  }
});

it.each(['failed', 'cancelled', 'stale', 'worker failure'])(
  'stops Run after a %s build',
  async outcome => {
    const commands = new CommandRegistry();
    const services = context();
    let finish = (_result: Result) => {};
    let fail = (_error: Error) => {};
    const compiled = new Promise<Result>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
    services.compiler.compile = () => compiled;
    const registered = registerCommands(commands, services);
    const running = commands.execute(CommandIDs.run);
    await Promise.resolve();
    if (outcome === 'cancelled') {
      await commands.execute(CommandIDs.cancel);
    } else if (outcome === 'stale') {
      await commands.execute(CommandIDs.setSource, { source: 'edited' });
    }
    if (outcome === 'worker failure') {
      fail(new Error('Compiler unavailable'));
    } else {
      finish({
        id: 1,
        sourcePath: '/workspace/snippet.cpp',
        artifacts: [],
        stages: [],
        files: [],
        diagnostics: [],
        commands: [],
        stdout: '',
        stderr: '',
        exitCode: outcome === 'failed' ? 1 : 0,
        duration: 1
      });
    }
    await running;
    expect(services.runner.run).not.toHaveBeenCalled();
    expect(services.activatePane).not.toHaveBeenCalledWith('run');
    expect(services.store.state.execution.notice).toBeNull();
    if (outcome === 'failed' || outcome === 'worker failure') {
      expect(services.activatePane).toHaveBeenCalledWith('diagnostics');
    } else {
      expect(services.activatePane).not.toHaveBeenCalled();
    }
    registered.dispose();
    services.store.dispose();
  }
);

it('expires confirmations independently of dismissible errors', async () => {
  jest.useFakeTimers();
  const commands = new CommandRegistry();
  const services = context();
  const registered = registerCommands(commands, {
    ...services,
    sharing: { read: () => null, clear: jest.fn(), copy: jest.fn() }
  });
  try {
    const store = services.store;
    store.dispatch({ type: 'notice', message: 'Storage unavailable' });
    await commands.execute(CommandIDs.share);
    expect(store.state.confirmation).toBe('Share link copied.');
    expect(store.state.notice).toBe('Storage unavailable');
    jest.advanceTimersByTime(3000);
    await commands.execute(CommandIDs.share);
    jest.advanceTimersByTime(3000);
    expect(store.state.confirmation).toBe('Share link copied.');
    jest.advanceTimersByTime(1000);
    expect(store.state.confirmation).toBeNull();
    expect(store.state.notice).toBe('Storage unavailable');
    await commands.execute(CommandIDs.dismissNotice);
    expect(store.state.notice).toBeNull();
    await commands.execute(CommandIDs.share);
    registered.dispose();
    const state = store.state;
    jest.runOnlyPendingTimers();
    expect(store.state).toBe(state);
  } finally {
    registered.dispose();
    services.store.dispose();
    jest.useRealTimers();
  }
});
