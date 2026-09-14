import type { CommandRegistry } from '@lumino/commands';
import * as React from 'react';
import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import { CommandIDs } from '../commands';
import type { Diagnostic, Options, OutputKind } from '../compiler/types';
import type { Pane } from '../model';
import type { IStore } from '../state';
import { Editor } from './editor';
import { Files, Output } from './outputs';
import { Pipelines, Run, Terminal } from './tools';
import { Controls, Diagnostics, Source } from './views';

export interface IBridgeProps {
  store: IStore;
  commands: CommandRegistry;
  pane: Pane | 'controls';
  output?: OutputKind;
  onSize(height: number): void;
}

/** Subscribe here; views receive state and command-backed callbacks. */
export function Bridge(props: IBridgeProps): React.ReactElement {
  const { store, commands, pane, onSize } = props;
  const node = useRef<HTMLDivElement>(null);
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
      onCompare: () => execute(CommandIDs.compare),
      onShare: () => execute(CommandIDs.share),
      onExample: () => execute(CommandIDs.example),
      onRun: () => execute(CommandIDs.run),
      onStop: () => execute(CommandIDs.stop),
      onCommand: (command: string) => execute(CommandIDs.terminal, { command }),
      onClear: () => execute(CommandIDs.clearTerminal),
      onSymbol: (symbol: string) => execute(CommandIDs.symbol, { symbol }),
      onArguments: (values: readonly string[]) =>
        execute(CommandIDs.runArguments, { values }),
      onTimeout: (timeout: number) => execute(CommandIDs.timeout, { timeout }),
      onModule: (path: string) => execute(CommandIDs.module, { path }),
      onCopy: (path: string, workspace: boolean) =>
        execute(CommandIDs.copy, { path, workspace }),
      onDownload: (path: string, workspace: boolean) =>
        execute(CommandIDs.download, { path, workspace }),
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
    case 'outputs':
    case 'comparison':
      return (
        <Output
          state={state}
          kind={props.output ?? 'assembly'}
          {...callbacks}
        />
      );
    case 'diagnostics':
      return <Diagnostics state={state} onNavigate={callbacks.onNavigate} />;
    case 'files':
      return <Files state={state} {...callbacks} />;
    case 'run':
      return <Run state={state} {...callbacks} />;
    case 'terminal':
      return <Terminal state={state} {...callbacks} />;
    case 'pipelines':
      return <Pipelines state={state} {...callbacks} />;
  }
}
