import * as React from 'react';

import {
  isLanguage,
  isOutputKind,
  isTarget,
  languageLabels,
  outputLabels,
  targetLabels,
  targets
} from '../compiler/types';
import type { Diagnostic, Options } from '../compiler/types';
import { canRun, stale } from '../model';
import type { State } from '../model';

interface IControlsProps {
  state: State;
  onOptions(options: Options): void;
  onCompile(): void;
  onCancel(): void;
  onRun(): void;
  onShare?(): void;
  onStop(): void;
  onAbout(): void;
  onDismissNotice(): void;
}

export function Controls(props: IControlsProps): React.ReactElement {
  const { state, onOptions } = props;
  const busy = state.active !== null;
  const downloads =
    state.progress?.phase === 'downloading' ? state.progress.downloads : null;
  const loaded = downloads?.reduce((sum, item) => sum + item.loaded, 0) ?? 0;
  const total = downloads?.reduce((sum, item) => sum + item.total, 0) ?? 0;
  return (
    <div className="llvm-explorer-controls">
      <div className="llvm-explorer-toolbar">
        <strong className="llvm-explorer-brand">
          <span className="llvm-explorer-icon" aria-hidden="true" />
          LLVM Explorer
        </strong>
        <label>
          <span>Language</span>
          <select
            aria-label="Language"
            value={state.options.language}
            onChange={event => {
              const language = event.target.value;
              if (isLanguage(language)) {
                onOptions({ ...state.options, language });
              }
            }}
          >
            {Object.entries(languageLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {state.options.language !== 'mlir' && (
          <>
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
                {targets.map(target => (
                  <option
                    key={target}
                    value={target}
                    disabled={
                      state.info !== null &&
                      !state.info.targets.includes(target)
                    }
                  >
                    {targetLabels[target]}
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
          </>
        )}
        <div className="llvm-explorer-actions">
          <button
            className="llvm-explorer-primary"
            onClick={props.onCompile}
            disabled={busy}
            title="Compile (Ctrl/Cmd+Enter)"
          >
            {state.status === 'failed' ? 'Retry compilation' : 'Compile'}
          </button>
          {busy && <button onClick={props.onCancel}>Cancel</button>}
          {(state.options.language !== 'mlir' || state.execution.module) &&
            (state.execution.active ? (
              <button onClick={props.onStop}>Stop</button>
            ) : (
              <button
                onClick={props.onRun}
                disabled={!canRun(state)}
                title={
                  state.options.target === 'wasm32-unknown-emscripten'
                    ? 'Compile if needed, then run a WebAssembly function'
                    : 'Select WebAssembly to run your code'
                }
              >
                Run
              </button>
            ))}
          {props.onShare && <button onClick={props.onShare}>Share</button>}
          <button onClick={props.onAbout}>About</button>
        </div>
      </div>
      <div className="llvm-explorer-status">
        <div className="llvm-explorer-activity">
          {busy && (
            <span className="llvm-explorer-spinner" aria-hidden="true" />
          )}
          <span
            className={state.status === 'failed' ? 'llvm-explorer-error' : ''}
            role="status"
            aria-label="Compiler status"
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
          {state.info?.version ?? 'Clang/LLVM'} · Runs in your browser
        </span>
      </div>
      {state.notice && (
        <div className="llvm-explorer-notice">
          <span role="alert">{state.notice}</span>
          <button onClick={props.onDismissNotice}>Dismiss message</button>
        </div>
      )}
      <div
        className="llvm-explorer-confirmation"
        role="status"
        aria-label="Confirmation"
      >
        {state.confirmation}
      </div>
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
    <section className="llvm-explorer-pane" aria-label="Source pane">
      {children}
      {(state.options.language === 'c' || state.options.language === 'cpp') &&
        state.options.target !== 'wasm32-unknown-emscripten' && (
          <p className="llvm-explorer-hint">
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
      className="llvm-explorer-pane llvm-explorer-diagnostics"
      aria-label="Diagnostics pane"
    >
      {stale(state) && (
        <p className="llvm-explorer-hint">Out of date — compile to update</p>
      )}
      <div className="llvm-explorer-diagnostic-list">
        {state.status === 'loading' && (
          <div className="llvm-explorer-loading">
            <p className="llvm-explorer-hint">
              {state.progress?.phase === 'preparing'
                ? 'Downloads complete. Preparing compiler…'
                : 'You can keep editing while the compiler loads.'}
            </p>
            {state.progress?.phase === 'downloading' && (
              <ul
                className="llvm-explorer-downloads"
                aria-label="Compiler assets"
              >
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
          <p className="llvm-explorer-hint llvm-explorer-error">
            {state.notice}
          </p>
        )}
        {result?.diagnostics.length ? (
          result.diagnostics.map((diagnostic, index) => (
            <button
              key={index}
              className="llvm-explorer-diagnostic"
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
          <p className="llvm-explorer-hint">
            {result
              ? result.exitCode === 0
                ? 'No errors or warnings.'
                : 'See build details for the failed stages.'
              : 'Compiler messages appear here.'}
          </p>
        ) : null}
        {result && result.stages.length > 0 && (
          <details open={result.exitCode !== 0}>
            <summary>Build details · {Math.round(result.duration)} ms</summary>
            <ul
              className="llvm-explorer-stages"
              aria-label="Compilation stages"
            >
              {result.stages.map(stage => (
                <li key={stage.name}>
                  <strong>
                    {isOutputKind(stage.name)
                      ? outputLabels[stage.name]
                      : stage.name}
                  </strong>
                  : {stage.status}
                  {' · '}
                  {Math.round(stage.duration)} ms
                  {stage.status !== 'success' && <pre>{stage.stderr}</pre>}
                </li>
              ))}
            </ul>
          </details>
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
      return 'Ready · Ctrl/Cmd+Enter to compile';
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
      return 'Cancelled';
    case 'failed':
      return 'Compiler unavailable — retry compilation';
    case 'ready':
      return stale(state)
        ? 'Out of date — compile to update'
        : state.result?.value.exitCode
          ? 'Some outputs failed — see Diagnostics'
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
