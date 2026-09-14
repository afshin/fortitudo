import { CommandRegistry } from '@lumino/commands';

import { CommandIDs } from '../commands';
import { example } from '../model';
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
  await commands.execute(CommandIDs.source, { source: 'first' });
  await commands.execute(CommandIDs.source, { source: 'second' });
  await commands.execute(CommandIDs.source, { source: 'third' });
  workbench.close();
  expect(workbench.isDisposed).toBe(true);
  expect(commands.hasCommand(CommandIDs.compile)).toBe(false);
  expect(commands.keyBindings).toHaveLength(0);
  release();
  await workbench.saved;
  expect(writes.map(value => value.source)).toEqual([example, 'third']);
  expect(writes.every(value => !('result' in value))).toBe(true);
});
