import * as React from 'react';

import { isTarget, labels, targets } from '../compiler/types';
import type { Diagnostic, Options } from '../compiler/types';
import { stale } from '../model';
import type { State } from '../model';

export interface IControlsProps {
  state: State;
  onOptions(options: Options): void;
  onCompile(): void;
  onCancel(): void;
  onLayout(): void;
  onClose(): void;
}

export function Controls(props: IControlsProps): React.ReactElement {
  const { state, onOptions } = props;
  const busy = state.active !== null;
  return (
    <div className="fortitudo-controls">
      <div className="fortitudo-toolbar">
        <strong className="fortitudo-brand">Fortitudo</strong>
        <label>
          <span>Language</span>
          <select
            aria-label="Language"
            value={state.options.language}
            onChange={event =>
              onOptions({
                ...state.options,
                language: event.target.value === 'c' ? 'c' : 'cpp'
              })
            }
          >
            <option value="cpp">C++23</option>
            <option value="c">C23</option>
          </select>
        </label>
        <label>
          <span>Target</span>
          <select
            aria-label="Target"
            value={state.options.target}
            onChange={event => {
              const target = event.target.value;
              if (isTarget(target)) {
                onOptions({ ...state.options, target });
              }
            }}
          >
            {targets
              .filter(
                target =>
                  target === 'wasm32-unknown-emscripten' ||
                  target === state.options.target ||
                  state.info?.targets.includes(target)
              )
              .map(target => (
                <option
                  key={target}
                  value={target}
                  disabled={
                    state.info !== null && !state.info.targets.includes(target)
                  }
                >
                  {labels[target]}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span>Optimization</span>
          <select
            aria-label="Optimization"
            value={state.options.optimization}
            onChange={event => {
              const optimization = Number(event.target.value);
              if (
                optimization === 0 ||
                optimization === 1 ||
                optimization === 2 ||
                optimization === 3
              ) {
                onOptions({ ...state.options, optimization });
              }
            }}
          >
            {[0, 1, 2, 3].map(level => (
              <option key={level} value={level}>
                O{level}
              </option>
            ))}
          </select>
        </label>
        <div className="fortitudo-actions">
          <button
            className="fortitudo-primary"
            onClick={props.onCompile}
            disabled={busy}
            title="Compile (Ctrl/Cmd+Enter)"
          >
            {state.status === 'failed' ? 'Retry compilation' : 'Compile'}
          </button>
          <button onClick={props.onCancel} disabled={!busy}>
            Cancel
          </button>
          <button onClick={props.onLayout} title="Restore default pane layout">
            Reset layout
          </button>
          <button onClick={props.onClose} aria-label="Close Fortitudo">
            Close
          </button>
        </div>
      </div>
      <div className="fortitudo-status" role="status" aria-live="polite">
        <span className={state.status === 'failed' ? 'fortitudo-error' : ''}>
          {status(state)}
        </span>
        <span>
          {state.info?.version ?? 'Clang / LLVM'} · Runs in your browser
        </span>
      </div>
      {state.notice && (
        <p className="fortitudo-notice" role="alert">
          {state.notice}
        </p>
      )}
    </div>
  );
}

export function Source({
  state,
  children
}: {
  state: State;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="fortitudo-pane" aria-label="Source pane">
      <div className="fortitudo-caption">
        <span>snippet.{state.options.language === 'cpp' ? 'cpp' : 'c'}</span>
        <span>Edit, then compile</span>
      </div>
      {children}
      {state.options.target !== 'wasm32-unknown-emscripten' && (
        <p className="fortitudo-hint">
          This target has Clang built-in headers. Use WebAssembly for the
          packaged C/C++ system headers.
        </p>
      )}
    </section>
  );
}

export function Assembly({ state }: { state: State }): React.ReactElement {
  const result = state.result?.value;
  return (
    <section className="fortitudo-pane" aria-label="Assembly pane">
      <div className="fortitudo-caption">
        <span>
          {stale(state) ? 'Out of date — compile to update' : 'Assembly'}
        </span>
        <span>
          {result
            ? `${Math.round(result.duration)} ms`
            : 'No entry point required'}
        </span>
      </div>
      <pre
        className="fortitudo-output"
        aria-label="Assembly output"
        tabIndex={0}
      >
        {result?.assembly ||
          (result?.exitCode
            ? 'Compilation failed. See Diagnostics for details.'
            : 'Compile your source to inspect the generated assembly.')}
      </pre>
    </section>
  );
}

export function Diagnostics({
  state,
  onNavigate
}: {
  state: State;
  onNavigate(diagnostic: Diagnostic): void;
}): React.ReactElement {
  const result = state.result?.value;
  const filename =
    `/workspace/request-${result?.id}/snippet.` +
    (state.options.language === 'cpp' ? 'cpp' : 'c');
  return (
    <section
      className="fortitudo-pane fortitudo-diagnostics"
      aria-label="Diagnostics pane"
    >
      <div className="fortitudo-caption">
        <span>Diagnostics {stale(state) ? '(out of date)' : ''}</span>
        <span>
          {result ? `Exit status ${result.exitCode}` : 'Ready when you are'}
        </span>
      </div>
      <div className="fortitudo-diagnostic-list">
        {result?.diagnostics.length ? (
          result.diagnostics.map((diagnostic, index) => (
            <button
              key={index}
              className="fortitudo-diagnostic"
              disabled={
                stale(state) ||
                diagnostic.file !== filename ||
                diagnostic.line === null ||
                diagnostic.column === null
              }
              onClick={() => onNavigate(diagnostic)}
            >
              <strong>{diagnostic.severity}</strong>{' '}
              {diagnostic.line ? `Line ${diagnostic.line}: ` : ''}
              {diagnostic.message}
            </button>
          ))
        ) : (
          <p className="fortitudo-hint">
            {result
              ? 'No structured diagnostics.'
              : 'Compiler messages appear here.'}
          </p>
        )}
        {result && (
          <details>
            <summary>Compiler output and commands</summary>
            <pre aria-label="Compiler output">
              {[...result.commands, result.stdout, result.stderr]
                .filter(Boolean)
                .join('\n\n')}
            </pre>
          </details>
        )}
      </div>
    </section>
  );
}

function status(state: State): string {
  switch (state.status) {
    case 'idle':
      return 'Ready to load the compiler';
    case 'loading':
      return 'Loading compiler…';
    case 'compiling':
      return 'Compiling…';
    case 'cancelled':
      return 'Cancelled — compile again when ready';
    case 'failed':
      return 'Compiler unavailable — retry to load it again';
    case 'ready':
      return state.result?.value.exitCode
        ? 'Compilation failed — inspect diagnostics'
        : stale(state)
          ? 'Source or options changed — compile to update'
          : state.result
            ? 'Compilation complete'
            : 'Compiler ready';
  }
}
