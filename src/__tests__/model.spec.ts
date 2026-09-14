import { initial, options, reduce, snapshot, stale } from '../model';
import type { Result } from '../compiler/types';
import { createStore } from '../state';
import { session } from '../persistence';

const result: Result = {
  id: 1,
  assembly: 'assembly',
  diagnostics: [],
  commands: [],
  stdout: '',
  stderr: '',
  exitCode: 0,
  duration: 10
};

it('associates output with its original input', () => {
  const original = Object.freeze(initial());
  const started = reduce(original, { type: 'begin', id: 1 });
  const edited = reduce(started, { type: 'source', source: 'new source' });
  const finished = reduce(edited, { type: 'finished', id: 1, result });
  expect(original.revision).toBe(0);
  expect(finished.source).toBe('new source');
  expect(stale(finished)).toBe(true);
  expect(finished.result?.revision).toBe(0);
});

it('ignores a response after cancellation or a newer request', () => {
  const started = reduce(initial(), { type: 'begin', id: 1 });
  const cancelled = reduce(started, { type: 'cancelled' });
  expect(reduce(cancelled, { type: 'finished', id: 1, result })).toBe(
    cancelled
  );
  const newer = reduce(cancelled, { type: 'begin', id: 2 });
  expect(reduce(newer, { type: 'finished', id: 1, result })).toBe(newer);
});

it('keeps snapshots stable and removes subscriptions on disposal', () => {
  const store = createStore(initial());
  const listener = jest.fn();
  const unsubscribe = store.subscribe(listener);
  const before = store.state;
  store.dispatch({ type: 'source', source: before.source });
  expect(store.state).toBe(before);
  expect(listener).not.toHaveBeenCalled();
  store.dispatch({ type: 'options', options: { ...options, optimization: 3 } });
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  store.dispatch({ type: 'source', source: 'changed' });
  expect(listener).toHaveBeenCalledTimes(1);
  const saved = store.state;
  store.dispose();
  store.dispatch({ type: 'source', source: 'ignored' });
  expect(store.state).toBe(saved);
});

it('validates saved inputs and pane identities', () => {
  const saved = snapshot(initial());
  expect(session(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  expect(session({ ...saved, version: 2 })).toBeNull();
  expect(
    session({ ...saved, options: { ...options, optimization: 99 } })
  ).toBeNull();
  expect(
    session({
      ...saved,
      layout: {
        type: 'tab-area',
        widgets: ['source', 'source', 'diagnostics'],
        currentIndex: 0
      }
    })
  ).toBeNull();
  const layout = {
    type: 'tab-area',
    widgets: ['source', 'assembly', 'diagnostics'],
    currentIndex: 1
  };
  expect(session({ ...saved, layout })?.layout).toEqual(layout);
});
