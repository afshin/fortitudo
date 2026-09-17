import { CommandRegistry } from '@lumino/commands';

import { CommandIDs } from '../commands';
import { initial, snapshot } from '../model';
import type { Session } from '../model';
import { createWorkbench } from '../workbench';

it('coalesces saved edits and finishes persistence after closing', async () => {
  const commands = new CommandRegistry();
  const writes: Session[] = [];
  let release = () => {};
  const waiting = new Promise<void>(resolve => {
    release = resolve;
  });
  const workbench = await createWorkbench({
    commands,
    workerUrl: new URL('https://example.test/compiler/worker.js'),
    persistence: {
      load: async () => null,
      save: async value => {
        writes.push(value);
        await waiting;
      }
    }
  });
  await commands.execute(CommandIDs.setSource, { source: 'first' });
  await commands.execute(CommandIDs.setSource, { source: 'second' });
  await commands.execute(CommandIDs.setSource, { source: 'third' });
  workbench.close();
  expect(workbench.isDisposed).toBe(true);
  expect(commands.hasCommand(CommandIDs.compile)).toBe(false);
  expect(commands.keyBindings).toHaveLength(0);
  release();
  await workbench.saved;
  expect(writes.map(value => value.source)).toEqual(['first', 'third']);
  expect(writes.every(value => !('result' in value))).toBe(true);
});

it('saves navigation and output selection without losing edits', async () => {
  const commands = new CommandRegistry();
  const writes: Session[] = [];
  const saved: Session = {
    ...snapshot(initial()),
    source: 'int restored() { return 42; }',
    layout: {
      type: 'tab-area',
      widgets: [
        'outputs',
        'source',
        'diagnostics',
        'files',
        'terminal',
        'run',
        'pipelines'
      ],
      currentIndex: 0
    }
  };
  const workbench = await createWorkbench({
    commands,
    workerUrl: new URL('https://example.test/compiler/worker.js'),
    persistence: {
      load: async () => saved,
      save: async value => {
        writes.push(value);
      }
    }
  });
  expect(writes).toEqual([]);
  await commands.execute(CommandIDs.navigate, { line: 1, column: 1 });
  await workbench.saved;
  expect(writes.at(-1)?.layout).toEqual({
    ...saved.layout,
    currentIndex: 1
  });
  await commands.execute(CommandIDs.selectOutput, { output: 'ir' });
  await workbench.saved;
  expect(writes.at(-1)?.output).toBe('ir');
  expect(writes.every(value => value.source === saved.source)).toBe(true);
  workbench.close();
  expect(writes).toHaveLength(2);
});

it.each([false, true])(
  'replaces invalid state before any edits (host defaults: %s)',
  async useDefaults => {
    const defaults = useDefaults
      ? { ...snapshot(initial()), source: 'host default' }
      : undefined;
    let saved: unknown = { version: 99 };
    const save = jest.fn(async (value: Session) => {
      saved = JSON.parse(JSON.stringify(value));
    });
    const options = {
      commands: new CommandRegistry(),
      workerUrl: new URL('https://example.test/compiler/worker.js'),
      defaults,
      persistence: { load: async () => saved, save }
    };
    const workbench = await createWorkbench(options);
    expect(saved).toEqual(defaults ?? snapshot(initial()));
    expect(save).toHaveBeenCalledTimes(1);
    workbench.close();
    const reopened = await createWorkbench(options);
    expect(save).toHaveBeenCalledTimes(1);
    reopened.close();
  }
);

it('keeps editing usable when saving the replacement session fails', async () => {
  const commands = new CommandRegistry();
  const save = jest
    .fn(async (_value: Session) => {})
    .mockRejectedValueOnce(new Error('Storage unavailable'));
  const workbench = await createWorkbench({
    commands,
    workerUrl: new URL('https://example.test/compiler/worker.js'),
    persistence: { load: async () => ({ version: 99 }), save }
  });
  expect(save).toHaveBeenCalledTimes(1);
  await commands.execute(CommandIDs.setSource, { source: 'edited' });
  await workbench.saved;
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenLastCalledWith(
    expect.objectContaining({ source: 'edited' })
  );
  workbench.close();
});

it('does not overwrite saved state when reading storage fails', async () => {
  const save = jest.fn();
  const workbench = await createWorkbench({
    commands: new CommandRegistry(),
    workerUrl: new URL('https://example.test/compiler/worker.js'),
    persistence: {
      load: async () => {
        throw new Error('Storage unavailable');
      },
      save
    }
  });
  expect(save).not.toHaveBeenCalled();
  workbench.close();
});

it.each([
  { invalid: false, fails: false },
  { invalid: false, fails: true },
  { invalid: true, fails: false },
  { invalid: true, fails: true }
])(
  'saves shared inputs first (invalid: $invalid, save fails: $fails)',
  async ({ invalid, fails }) => {
    const commands = new CommandRegistry();
    const shared = { ...snapshot(initial()), source: 'shared' };
    const clear = jest.fn();
    let saved: Session | null = null;
    const save = jest.fn(async (value: Session) => {
      expect(clear).not.toHaveBeenCalled();
      expect(value.source).not.toBe(initial().source);
      if (fails) {
        fails = false;
        throw new Error('Storage unavailable');
      }
      saved = value;
    });
    const workbench = await createWorkbench({
      commands,
      workerUrl: new URL('https://example.test/compiler/worker.js'),
      persistence: {
        load: async () => (invalid ? { version: 99 } : snapshot(initial())),
        save
      },
      sharing: { read: () => shared, clear, copy: jest.fn() }
    });
    if (saved === null) {
      expect(clear).not.toHaveBeenCalled();
      await commands.execute(CommandIDs.setSource, { source: 'edited' });
      await workbench.saved;
      expect(saved).toMatchObject({ source: 'edited' });
    } else {
      expect(saved).toEqual(shared);
    }
    expect(clear).toHaveBeenCalledTimes(1);
    workbench.close();
  }
);
