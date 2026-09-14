import type { CommandRegistry } from '@lumino/commands';
import * as React from 'react';
import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import { CommandIDs } from '../commands';
import type { Diagnostic, Options } from '../compiler/types';
import type { Pane } from '../model';
import type { IStore } from '../state';
import { Editor } from './editor';
import { Assembly, Controls, Diagnostics, Source } from './views';

export interface IBridgeProps {
  store: IStore;
  commands: CommandRegistry;
  pane: Pane | 'controls';
  onSize(height: number): void;
}

/** The only React subscription to semantic application state. */
export function Bridge(props: IBridgeProps): React.ReactElement {
  const { store, commands, pane } = props;
  const node = useRef<HTMLDivElement>(null);
  const { onSize } = props;
  useLayoutEffect(() => {
    const element = node.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(() => {
      onSize(element.getBoundingClientRect().height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [onSize]);
  const state = useSyncExternalStore(store.subscribe, () => store.state);
  const callbacks = useMemo(() => {
    const execute = (id: string, args = {}) => {
      void commands.execute(id, args).catch(error => {
        store.dispatch({ type: 'notice', message: String(error) });
      });
    };
    return {
      onChange: (source: string) => execute(CommandIDs.source, { source }),
      onOptions: (options: Options) => execute(CommandIDs.options, { options }),
      onCompile: () => execute(CommandIDs.compile),
      onCancel: () => execute(CommandIDs.cancel),
      onLayout: () => execute(CommandIDs.layout),
      onNavigate: ({ line, column }: Diagnostic) =>
        execute(CommandIDs.navigate, { line, column })
    };
  }, [store, commands]);
  switch (pane) {
    case 'controls':
      return (
        <div ref={node}>
          <Controls state={state} {...callbacks} />
        </div>
      );
    case 'source':
      return (
        <Source state={state}>
          <Editor store={store} onChange={callbacks.onChange} />
        </Source>
      );
    case 'assembly':
      return <Assembly state={state} />;
    case 'diagnostics':
      return <Diagnostics state={state} onNavigate={callbacks.onNavigate} />;
  }
}
