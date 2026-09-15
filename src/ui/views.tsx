import * as React from 'react';

import {
  isLanguage,
  isTarget,
  labels,
  languages,
  targets
} from '../compiler/types';
import type { Diagnostic, Options } from '../compiler/types';
import { stale } from '../model';
import type { State } from '../model';

export interface IControlsProps {
  state: State;
  onOptions(options: Options): void;
  onCompile(): void;
  onCancel(): void;
  onLayout(): void;
  onRun(): void;
  onCompare(): void;
  onShare?(): void;
  onExample(): void;
}

export function Controls(props: IControlsProps): React.ReactElement {
  const { state, onOptions } = props;
  const busy = state.active !== null;
  const downloads =
    state.progress?.phase === 'downloading' ? state.progress.downloads : null;
  const loaded = downloads?.reduce((sum, item) => sum + item.loaded, 0) ?? 0;
  const total = downloads?.reduce((sum, item) => sum + item.total, 0) ?? 0;
  return (
    <div className="fortitudo-controls">
      <div className="fortitudo-toolbar">
        <strong className="fortitudo-brand">
          <span className="fortitudo-icon" aria-hidden="true" />
          Fortitudo
        </strong>
        <label>
          <span>Language</span>
          <select
            aria-label="Language"
            value={state.options.language}
            onChange={event =>
              onOptions({
                ...state.options,
                language: isLanguage(event.target.value)
                  ? event.target.value
                  : state.options.language
              })
            }
          >
            {Object.entries(languages).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Target</span>
          <select
            aria-label="Target"
            disabled={state.options.language === 'mlir'}
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
            disabled={state.options.language === 'mlir'}
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
          <button
            onClick={props.onRun}
            disabled={
              busy ||
              state.execution.active !== null ||
              (!state.execution.module &&
                (state.options.language === 'mlir' ||
                  state.options.target !== 'wasm32-unknown-emscripten'))
            }
          >
            Run
          </button>
          <button onClick={props.onCompare}>Compare</button>
          {props.onShare && <button onClick={props.onShare}>Share</button>}
          <button onClick={props.onExample}>Reset example</button>
          <button onClick={props.onLayout} title="Restore default pane layout">
            Reset layout
          </button>
        </div>
      </div>
      <div className="fortitudo-status">
        <div className="fortitudo-activity">
          {busy && <span className="fortitudo-spinner" aria-hidden="true" />}
          <span
            className={state.status === 'failed' ? 'fortitudo-error' : ''}
            role="status"
            aria-live="polite"
          >
            {status(state)}
          </span>
          {downloads && (
            <>
              <progress
                aria-label="Compiler download"
                aria-valuetext={bytes(loaded, total)}
                value={loaded}
                max={total}
              />
              <span aria-hidden="true">{bytes(loaded, total)}</span>
            </>
          )}
        </div>
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

export function Diagnostics({
  state,
  onNavigate
}: {
  state: State;
  onNavigate(diagnostic: Diagnostic): void;
}): React.ReactElement {
  const result = state.result?.value;
  const filename = result?.sourcePath;
  return (
    <section
      className="fortitudo-pane fortitudo-diagnostics"
      aria-label="Diagnostics pane"
    >
      {stale(state) && (
        <p className="fortitudo-hint">Out of date — compile to update</p>
      )}
      <div className="fortitudo-diagnostic-list">
        {state.status === 'loading' && (
          <div className="fortitudo-loading">
            <p className="fortitudo-hint">
              {state.progress?.phase === 'preparing'
                ? 'Downloads complete. Checking assets and preparing compiler…'
                : 'You can keep editing while the compiler loads.'}
            </p>
            {state.progress?.phase === 'downloading' && (
              <ul className="fortitudo-downloads" aria-label="Compiler assets">
                {state.progress.downloads.map(download => (
                  <li key={download.name}>
                    <span>{download.name}</span>
                    <span>{bytes(download.loaded, download.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {state.status === 'failed' && state.notice && (
          <p className="fortitudo-hint fortitudo-error">{state.notice}</p>
        )}
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
        ) : state.active === null && state.status !== 'failed' ? (
          <p className="fortitudo-hint">
            {result
              ? 'No structured diagnostics.'
              : 'Compiler messages appear here.'}
          </p>
        ) : null}
        {result && result.stages.length > 0 && (
          <ul className="fortitudo-stages" aria-label="Build stages">
            {result.stages.map(stage => (
              <li key={stage.name}>
                <strong>{stage.name}</strong>: {stage.status}
                {' · '}
                {Math.round(stage.duration)} ms
                {stage.status !== 'success' && <pre>{stage.stderr}</pre>}
              </li>
            ))}
          </ul>
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
      return state.progress?.phase === 'downloading'
        ? 'Downloading compiler…'
        : state.progress?.phase === 'preparing'
          ? 'Preparing compiler…'
          : 'Loading compiler…';
    case 'compiling':
      return state.progress?.phase === 'working'
        ? `${state.progress.stage}…`
        : 'Compiling…';
    case 'cancelled':
      return 'Cancelled — compile again when ready';
    case 'failed':
      return 'Compiler unavailable — retry to load it again';
    case 'ready':
      return state.result?.value.exitCode
        ? 'Some outputs failed — inspect diagnostics'
        : stale(state)
          ? 'Source or options changed — compile to update'
          : state.result
            ? 'Compilation complete'
            : 'Compiler ready';
  }
}

function bytes(loaded: number, total: number): string {
  const loadedMB = (loaded / 1_000_000).toFixed(1);
  const totalMB = (total / 1_000_000).toFixed(1);
  return `${loadedMB} / ${totalMB} MB`;
}
