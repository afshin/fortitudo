import type { CommandRegistry } from '@lumino/commands';
import { DisposableSet } from '@lumino/disposable';
import type { IDisposable } from '@lumino/disposable';

import type { IRunner } from './compiler/execution';
import { isTimeout } from './compiler/execution';
import { command } from './compiler/terminal';
import { isOptions, isOutputKind, sourceName } from './compiler/types';
import type { File, ICompiler, Progress } from './compiler/types';
import { examples } from './examples';
import { canRun, currentModule, hasComparison, snapshot } from './model';
import type { Pane } from './model';
import { session } from './persistence';
import type { ISharing } from './share';
import type { IStore } from './state';

export namespace CommandIDs {
  export const initialize = 'fortitudo:initialize';
  export const source = 'fortitudo:source';
  export const options = 'fortitudo:options';
  export const compile = 'fortitudo:compile';
  export const cancel = 'fortitudo:cancel';
  export const layout = 'fortitudo:reset-layout';
  export const layoutChanged = 'fortitudo:layout-changed';
  export const navigate = 'fortitudo:navigate';
  export const output = 'fortitudo:output';
  export const compare = 'fortitudo:compare';
  export const example = 'fortitudo:example';
  export const terminal = 'fortitudo:terminal';
  export const clearTerminal = 'fortitudo:clear-terminal';
  export const run = 'fortitudo:run';
  export const stop = 'fortitudo:stop';
  export const module = 'fortitudo:module';
  export const symbol = 'fortitudo:symbol';
  export const runArguments = 'fortitudo:arguments';
  export const timeout = 'fortitudo:timeout';
  export const share = 'fortitudo:share';
  export const copy = 'fortitudo:copy';
  export const download = 'fortitudo:download';
}

export interface IContext {
  readonly store: IStore;
  readonly compiler: ICompiler;
  readonly runner: IRunner;
  readonly sharing?: ISharing;
  resetLayout(): void;
  compare(): void;
  activatePane(pane: Pane): void;
  copy(text: string): Promise<void>;
  download(file: File): void;
}

/** Register the complete controller against either host's command registry. */
export function registerCommands(
  commands: CommandRegistry,
  context: IContext
): IDisposable {
  const { store, compiler, runner } = context;
  const disposables = new DisposableSet();
  let sequence = 0;
  let disposed = false;
  let startingRun = false;
  const idle = () => !disposed && store.state.active === null;
  const add = (id: string, options: CommandRegistry.ICommandOptions) =>
    disposables.add(commands.addCommand(id, options));

  async function build(compile: boolean): Promise<void> {
    if (!idle()) {
      return;
    }
    const id = ++sequence;
    const { source, options } = store.state;
    store.dispatch({ type: 'begin', id });
    const progress = (progress: Progress) => {
      if (!disposed) {
        store.dispatch({ type: 'progress', id, progress });
      }
    };
    try {
      const info = await compiler.initialize(progress);
      if (disposed || store.state.active?.id !== id) {
        return;
      }
      store.dispatch({ type: 'initialized', id, info, compile });
      if (compile) {
        const result = await compiler.compile(
          { id, source, options },
          progress
        );
        store.dispatch({ type: 'finished', id, result });
      }
    } catch (error) {
      if (!disposed) {
        store.dispatch({ type: 'failed', id, message: String(error) });
      }
    }
  }

  add(CommandIDs.initialize, {
    label: 'Load compiler',
    isEnabled: idle,
    execute: () => build(false)
  });
  add(CommandIDs.compile, {
    label: 'Compile',
    isEnabled: idle,
    execute: () => build(true)
  });
  add(CommandIDs.cancel, {
    label: 'Cancel',
    isEnabled: () => !idle(),
    execute: () => {
      if (!idle()) {
        store.dispatch({ type: 'cancelled' });
        compiler.cancel();
      }
    }
  });
  add(CommandIDs.source, {
    label: 'Edit source',
    execute: args => {
      if (typeof args.source !== 'string') {
        throw new Error('Source must be text.');
      }
      store.dispatch({ type: 'source', source: args.source });
    }
  });
  add(CommandIDs.options, {
    label: 'Change compiler options',
    execute: args => {
      if (!isOptions(args.options)) {
        throw new Error('Invalid compiler options.');
      }
      store.dispatch({ type: 'options', options: args.options });
    }
  });
  add(CommandIDs.example, {
    label: 'Reset to example',
    execute: () => {
      store.dispatch({
        type: 'source',
        source: examples[store.state.options.language]
      });
    }
  });
  add(CommandIDs.layout, {
    label: 'Restore default layout',
    execute: () => context.resetLayout()
  });
  add(CommandIDs.compare, {
    label: 'Compare outputs',
    isToggled: () => hasComparison(store.state.layout),
    execute: () => {
      if (!hasComparison(store.state.layout)) {
        store.dispatch({ type: 'output', group: 'primary', output: 'ir' });
        store.dispatch({
          type: 'output',
          group: 'comparison',
          output: 'optimized'
        });
      }
      context.compare();
    }
  });
  add(CommandIDs.output, {
    label: 'Select output',
    execute: args => {
      if (
        (args.group !== 'primary' && args.group !== 'comparison') ||
        !isOutputKind(args.output)
      ) {
        throw new Error('Invalid output selection.');
      }
      store.dispatch({
        type: 'output',
        group: args.group,
        output: args.output
      });
    }
  });
  add(CommandIDs.layoutChanged, {
    label: 'Save pane layout',
    execute: args => {
      const saved = session({ ...snapshot(store.state), layout: args.layout });
      if (!saved) {
        throw new Error('Invalid pane layout.');
      }
      store.dispatch({ type: 'layout', layout: saved.layout });
    }
  });
  add(CommandIDs.navigate, {
    label: 'Go to diagnostic',
    execute: args => {
      const { line, column } = args;
      if (
        typeof line !== 'number' ||
        typeof column !== 'number' ||
        !Number.isInteger(line) ||
        !Number.isInteger(column) ||
        line < 1 ||
        column < 1
      ) {
        throw new Error('Invalid source location.');
      }
      store.dispatch({ type: 'navigate', line, column });
    }
  });
  add(CommandIDs.terminal, {
    label: 'Run command',
    isEnabled: idle,
    execute: async args => {
      if (!idle()) {
        return;
      }
      if (typeof args.command !== 'string') {
        throw new Error('Command must be text.');
      }
      try {
        command(args.command);
      } catch (error) {
        store.dispatch({ type: 'notice', message: String(error) });
        return;
      }
      const id = ++sequence;
      const path = `/workspace/${sourceName(store.state.options.language)}`;
      const files = [
        ...store.state.files.filter(file => file.path !== path),
        { path, data: new TextEncoder().encode(store.state.source) }
      ];
      store.dispatch({ type: 'begin', id });
      try {
        const result = await compiler.command(
          {
            id,
            command: args.command,
            files
          },
          progress => store.dispatch({ type: 'progress', id, progress })
        );
        store.dispatch({ type: 'command', id, result });
      } catch (error) {
        store.dispatch({ type: 'failed', id, message: String(error) });
      }
    }
  });
  add(CommandIDs.clearTerminal, {
    label: 'Clear command log',
    execute: () => {
      store.dispatch({ type: 'clear-terminal' });
    }
  });
  add(CommandIDs.module, {
    label: 'Select Wasm module',
    execute: args => {
      if (
        typeof args.path !== 'string' ||
        !store.state.files.some(file => file.path === args.path)
      ) {
        throw new Error('The selected module is not in the workspace.');
      }
      runner.reset();
      store.dispatch({ type: 'module', path: args.path });
      context.activatePane('run');
    }
  });
  add(CommandIDs.symbol, {
    label: 'Select export',
    execute: args => {
      if (typeof args.symbol !== 'string' || store.state.execution.active) {
        return;
      }
      store.dispatch({ type: 'symbol', symbol: args.symbol });
    }
  });
  add(CommandIDs.runArguments, {
    label: 'Change arguments',
    execute: args => {
      if (
        !Array.isArray(args.values) ||
        !args.values.every(
          (value): value is string => typeof value === 'string'
        )
      ) {
        throw new Error('Arguments must be text values.');
      }
      store.dispatch({ type: 'arguments', args: args.values });
    }
  });
  add(CommandIDs.timeout, {
    label: 'Change execution timeout',
    execute: args => {
      if (!isTimeout(args.timeout)) {
        throw new Error('Timeout is outside the browser timer range.');
      }
      store.dispatch({ type: 'timeout', timeout: args.timeout });
    }
  });
  add(CommandIDs.stop, {
    label: 'Stop / reset execution',
    execute: () => {
      store.dispatch({ type: 'run-reset' });
      runner.reset();
    }
  });
  add(CommandIDs.run, {
    label: 'Run',
    isEnabled: () => !disposed && !startingRun && canRun(store.state),
    execute: async () => {
      if (disposed || startingRun || !canRun(store.state)) {
        return;
      }
      startingRun = true;
      let id: number | null = null;
      try {
        if (!currentModule(store.state)) {
          await build(true);
        }
        if (disposed) {
          return;
        }
        context.activatePane('run');
        const state = store.state;
        if (!currentModule(state)) {
          throw new Error(
            'No current Wasm module. Check source and compilation diagnostics.'
          );
        }
        const execution = state.execution;
        const fn = execution.info?.functions.find(
          fn => fn.name === execution.symbol
        );
        if (!execution.module || !fn || fn.code === null) {
          throw new Error(
            execution.notice || 'Select a supported export in the Run pane.'
          );
        }
        const values =
          fn.name === 'main' && fn.code === 2
            ? [0, 0]
            : execution.args.map(value => (value.trim() ? Number(value) : NaN));
        if (
          values.length !== fn.params.length ||
          values.some(
            value =>
              !Number.isFinite(value) ||
              (Number(fn.code) <= 2 &&
                (!Number.isInteger(value) ||
                  value < -2147483648 ||
                  value > 2147483647))
          )
        ) {
          throw new Error(
            'Enter valid arguments for the displayed Wasm signature.'
          );
        }
        id = ++sequence;
        const current = id;
        store.dispatch({ type: 'run-begin', id });
        const result = await runner.run(
          {
            id,
            module: execution.module,
            files: state.files,
            symbol: fn.name,
            signature: fn.code,
            args: values
          },
          state.timeout,
          progress =>
            store.dispatch({ type: 'run-progress', id: current, progress })
        );
        store.dispatch({ type: 'run-finished', id, result });
      } catch (error) {
        if (id !== null) {
          store.dispatch({ type: 'run-failed', id, message: String(error) });
        } else if (!disposed) {
          store.dispatch({ type: 'notice', message: String(error) });
        }
      } finally {
        startingRun = false;
        commands.notifyCommandChanged(CommandIDs.run);
      }
    }
  });
  add(CommandIDs.share, {
    label: 'Copy share link',
    isVisible: () => !!context.sharing,
    isEnabled: () => !!context.sharing,
    execute: async () => {
      await context.sharing?.copy(snapshot(store.state));
      store.dispatch({ type: 'notice', message: 'Share link copied.' });
    }
  });
  for (const id of [CommandIDs.copy, CommandIDs.download]) {
    add(id, {
      label: id === CommandIDs.copy ? 'Copy output' : 'Download file',
      execute: async args => {
        const files = args.workspace
          ? store.state.files
          : store.state.result?.value.files;
        const file = files?.find(file => file.path === args.path);
        if (!file) {
          throw new Error('The file is no longer available.');
        }
        if (id === CommandIDs.copy) {
          await context.copy(new TextDecoder().decode(file.data));
        } else {
          context.download(file);
        }
      }
    });
  }
  let files = store.state.files;
  const unsubscribe = store.subscribe(() => {
    if (files !== store.state.files) {
      files = store.state.files;
      runner.reset();
    }
    for (const id of [
      CommandIDs.compile,
      CommandIDs.cancel,
      CommandIDs.initialize,
      CommandIDs.compare,
      CommandIDs.run,
      CommandIDs.terminal
    ]) {
      commands.notifyCommandChanged(id);
    }
  });
  return {
    get isDisposed() {
      return disposed;
    },
    dispose() {
      if (!disposed) {
        disposed = true;
        unsubscribe();
        compiler.cancel();
        runner.reset();
        disposables.dispose();
      }
    }
  };
}
