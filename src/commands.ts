import type { CommandRegistry } from '@lumino/commands';
import { DisposableSet } from '@lumino/disposable';
import type { IDisposable } from '@lumino/disposable';

import { isOptions } from './compiler/types';
import type { ICompiler } from './compiler/types';
import { snapshot } from './model';
import { session } from './persistence';
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
}

export interface IContext {
  readonly store: IStore;
  readonly compiler: ICompiler;
  resetLayout(): void;
}

/** Register one session's controllers against either host's registry. */
export function registerCommands(
  commands: CommandRegistry,
  context: IContext
): IDisposable {
  const { store, compiler } = context;
  const disposables = new DisposableSet();
  let sequence = 0;
  let disposed = false;
  const idle = () => !disposed && store.state.active === null;

  async function run(compile: boolean): Promise<void> {
    if (!idle()) {
      return;
    }
    const id = ++sequence;
    const { source, options } = store.state;
    store.dispatch({ type: 'begin', id });
    try {
      const info = await compiler.initialize();
      if (disposed || store.state.active?.id !== id) {
        return;
      }
      store.dispatch({ type: 'initialized', id, info, compile });
      if (compile) {
        const result = await compiler.compile({ id, source, options });
        store.dispatch({ type: 'finished', id, result });
      }
    } catch (error) {
      if (!disposed && store.state.active?.id === id) {
        store.dispatch({
          type: 'failed',
          id,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  disposables.add(
    commands.addCommand(CommandIDs.initialize, {
      label: 'Load compiler',
      isEnabled: idle,
      execute: () => run(false)
    })
  );
  disposables.add(
    commands.addCommand(CommandIDs.compile, {
      label: 'Compile',
      isEnabled: idle,
      execute: () => run(true)
    })
  );
  disposables.add(
    commands.addCommand(CommandIDs.cancel, {
      label: 'Cancel',
      isEnabled: () => !idle(),
      execute: () => {
        if (!idle()) {
          store.dispatch({ type: 'cancelled' });
          compiler.cancel();
        }
      }
    })
  );
  disposables.add(
    commands.addCommand(CommandIDs.source, {
      label: 'Edit source',
      execute: args => {
        if (typeof args.source !== 'string') {
          throw new Error('Source must be text.');
        }
        store.dispatch({ type: 'source', source: args.source });
      }
    })
  );
  disposables.add(
    commands.addCommand(CommandIDs.options, {
      label: 'Change compiler options',
      execute: args => {
        if (!isOptions(args.options)) {
          throw new Error('Invalid compiler options.');
        }
        store.dispatch({ type: 'options', options: args.options });
      }
    })
  );
  disposables.add(
    commands.addCommand(CommandIDs.layout, {
      label: 'Restore default layout',
      execute: () => context.resetLayout()
    })
  );
  disposables.add(
    commands.addCommand(CommandIDs.layoutChanged, {
      label: 'Save pane layout',
      execute: args => {
        const saved = session({
          ...snapshot(store.state),
          layout: args.layout
        });
        if (!saved) {
          throw new Error('Invalid pane layout.');
        }
        store.dispatch({ type: 'layout', layout: saved.layout });
      }
    })
  );
  disposables.add(
    commands.addCommand(CommandIDs.navigate, {
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
    })
  );
  const unsubscribe = store.subscribe(() => {
    commands.notifyCommandChanged(CommandIDs.compile);
    commands.notifyCommandChanged(CommandIDs.cancel);
    commands.notifyCommandChanged(CommandIDs.initialize);
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
        disposables.dispose();
      }
    }
  };
}
