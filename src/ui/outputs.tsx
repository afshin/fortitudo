import { useEffect, useMemo, useState } from 'react';
import * as React from 'react';

import type { File, OutputKind } from '../compiler/types';
import { outputLabels } from '../compiler/types';
import { inspectWasm } from '../compiler/wasm';
import { stale } from '../model';
import type { State } from '../model';
import { TextOutput } from './text';

export interface IFileActions {
  onCopy(path: string, workspace: boolean): void;
  onDownload(path: string, workspace: boolean): void;
  onModule(path: string): void;
}

export function Output({
  state,
  kind,
  ...actions
}: IFileActions & {
  state: State;
  kind: OutputKind;
}): React.ReactElement {
  const [selected, select] = useState('');
  const result = state.result?.value;
  const artifacts = result?.artifacts.filter(
    artifact => artifact.kind === kind
  );
  const paths =
    artifacts
      ?.filter(artifact => kind !== 'graphs' || artifact.path.endsWith('.svg'))
      .map(artifact => artifact.path) ?? [];
  const path = paths.includes(selected) ? selected : paths[0];
  const file = result?.files.find(file => file.path === path);
  const stage = result?.stages.find(stage => stage.name === kind);
  const failure = stage?.status === 'skipped' ? 'Skipped' : 'Failed';
  const message = !result
    ? 'Compile your source to inspect this output.'
    : !stage
      ? 'This output does not apply to the compiled language or target.'
      : stage.status === 'success'
        ? kind === 'graphs'
          ? 'No function graphs were generated.'
          : 'This stage produced no file.'
        : `${failure}: ${stage.stderr}`;
  return (
    <section
      className="fortitudo-pane"
      aria-label={`${outputLabels[kind]} pane`}
    >
      <div className="fortitudo-caption">
        <span>
          {stale(state)
            ? 'Out of date — compile to update'
            : outputLabels[kind]}
        </span>
        <span>
          {result
            ? `${Math.round(result.duration)} ms`
            : 'No entry point required'}
        </span>
      </div>
      {kind === 'graphs' && paths.length > 0 && (
        <label className="fortitudo-file-picker">
          Function graph
          <select value={path} onChange={event => select(event.target.value)}>
            {paths.map(path => (
              <option key={path} value={path}>
                {filename(path)
                  .replace(/^\./, '')
                  .replace(/\.dot\.svg$/, '')}
              </option>
            ))}
          </select>
        </label>
      )}
      {file ? (
        <FileOutput
          file={file}
          workspace={false}
          label={`${outputLabels[kind]} output`}
          {...actions}
        />
      ) : (
        <pre
          className="fortitudo-output"
          aria-label={`${outputLabels[kind]} output`}
        >
          {message}
        </pre>
      )}
    </section>
  );
}

export function Files({
  state,
  ...actions
}: IFileActions & {
  state: State;
}): React.ReactElement {
  const [selected, select] = useState('');
  const file =
    state.files.find(file => file.path === selected) ?? state.files[0];
  return (
    <section className="fortitudo-pane" aria-label="Files pane">
      <label className="fortitudo-file-picker">
        Workspace file
        <select
          value={file?.path ?? ''}
          onChange={event => select(event.target.value)}
        >
          {state.files.map(file => (
            <option key={file.path} value={file.path}>
              {filename(file.path)} ({file.data.length.toLocaleString()} bytes)
            </option>
          ))}
        </select>
      </label>
      {state.filesRevision !== null &&
        state.filesRevision !== state.revision && (
          <p className="fortitudo-hint">
            These files belong to earlier source or options.
          </p>
        )}
      {file ? (
        <FileOutput file={file} workspace label="File output" {...actions} />
      ) : (
        <p className="fortitudo-hint">
          Compile or run a command to create files.
        </p>
      )}
    </section>
  );
}

function FileOutput({
  file,
  workspace,
  label,
  ...actions
}: IFileActions & {
  file: File;
  workspace: boolean;
  label: string;
}): React.ReactElement {
  const wasm = file.path.endsWith('.wasm');
  const extension = file.path.split('.').pop()?.toLowerCase() ?? '';
  const imageTypes: Readonly<Record<string, string>> = {
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp'
  };
  const image = imageTypes[extension];
  const binary =
    wasm ||
    ['o', 'a', 'so', 'bc', 'bin'].includes(extension) ||
    file.data.subarray(0, 1024).includes(0);
  const text = useMemo(
    () => (binary ? '' : new TextDecoder().decode(file.data)),
    [file.data, binary]
  );
  return (
    <>
      <div className="fortitudo-file-actions">
        <span>{filename(file.path)}</span>
        {!binary && !image && (
          <button onClick={() => actions.onCopy(file.path, workspace)}>
            Copy
          </button>
        )}
        <button onClick={() => actions.onDownload(file.path, workspace)}>
          Download
        </button>
        {image && file.path.endsWith('.dot.svg') && (
          <button
            onClick={() =>
              actions.onDownload(file.path.replace(/\.svg$/, ''), workspace)
            }
          >
            Download DOT
          </button>
        )}
        {wasm && workspace && (
          <button onClick={() => actions.onModule(file.path)}>
            Use module
          </button>
        )}
      </div>
      {wasm ? (
        <WasmOutput file={file} />
      ) : image ? (
        <ImageOutput data={file.data} type={image} />
      ) : binary ? (
        <pre className="fortitudo-output">
          {file.data.length.toLocaleString()} bytes{'\n\n'}
          {Array.from(file.data.subarray(0, 256), byte =>
            byte.toString(16).padStart(2, '0')
          ).join(' ')}
        </pre>
      ) : (
        <TextOutput text={text} label={label} />
      )}
    </>
  );
}

function WasmOutput({ file }: { file: File }): React.ReactElement {
  const content = useMemo(() => {
    try {
      const info = inspectWasm(file.data);
      return [
        `WebAssembly side module · ${info.bytes.toLocaleString()} bytes`,
        '',
        'Exported functions:',
        ...info.functions.map(fn => `  ${fn.name}: ${fn.signature}`),
        '',
        'All exports:',
        ...info.exports.map(entry => `  ${entry.name} (${entry.kind})`),
        '',
        'Imports:',
        ...info.imports.map(
          entry => `  ${entry.module}.${entry.name} (${entry.kind})`
        )
      ].join('\n');
    } catch (error) {
      return String(error);
    }
  }, [file]);
  return <TextOutput text={content} label="Wasm module output" />;
}

/** Image URLs and zoom are owned by this presentation bridge. */
function ImageOutput({
  data,
  type
}: {
  data: Uint8Array;
  type: string;
}): React.ReactElement {
  const [url, setUrl] = useState('');
  const [zoom, setZoom] = useState<number | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([data], { type }));
    setUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [data, type]);
  return (
    <>
      <div className="fortitudo-file-actions">
        <button onClick={() => setZoom(null)}>Fit graph</button>
        <button onClick={() => setZoom(Math.max(0.1, (zoom ?? 1) / 1.25))}>
          Zoom out
        </button>
        <button onClick={() => setZoom(Math.min(8, (zoom ?? 1) * 1.25))}>
          Zoom in
        </button>
      </div>
      <div className="fortitudo-graph">
        {url && (
          <img
            src={url}
            alt="Compiler graph"
            style={
              zoom === null
                ? {
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain'
                  }
                : { zoom }
            }
          />
        )}
      </div>
    </>
  );
}

function filename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
