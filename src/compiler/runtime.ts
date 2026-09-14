import { assets } from './assets';
import { diagnostics } from './diagnostics';
import { record } from './protocol';
import { invocation, serialize } from './request';
import type { Info, Progress, Request, Result, Target } from './types';

interface IFilesystem {
  mkdirTree(path: string): void;
  writeFile(path: string, text: string): void;
  readFile(path: string, options: { encoding: 'utf8' }): string;
  readdir(path: string): string[];
  unlink(path: string): void;
  rmdir(path: string): void;
}

interface IModule {
  FS: IFilesystem;
  ccall(
    name: string,
    result: string,
    types: string[],
    arguments_: unknown[]
  ): unknown;
}

interface IModuleOptions {
  locateFile(path: string): string;
  wasmBinary: Uint8Array;
  getPreloadedPackage(name: string, size: number): ArrayBuffer;
  stdout(byte: number): void;
  stderr(byte: number): void;
}

export interface IRuntime {
  readonly info: Info;
  compile(request: Request): Result;
}

/** Load the generated compiler without allowing a bundler to rewrite it. */
export async function initialize(
  base: string,
  onProgress: (progress: Progress) => void
): Promise<IRuntime> {
  const response = await fetch(new URL('manifest.json', base));
  if (!response.ok) {
    throw new Error(`Compiler manifest could not load (${response.status}).`);
  }
  const manifest: unknown = await response.json();
  if (
    !record(manifest) ||
    manifest.format !== 1 ||
    typeof manifest.version !== 'string' ||
    typeof manifest.resourceDirectory !== 'string'
  ) {
    throw new Error('The compiler manifest is invalid.');
  }
  const url = new URL('Compiler.js', base).href;
  const [loader, { data, wasm }]: [
    unknown,
    { data: ArrayBuffer; wasm: ArrayBuffer }
  ] = await Promise.all([
    import(/* @vite-ignore */ url),
    assets(base, manifest.files, onProgress)
  ]);
  if (!record(loader) || !factory(loader.default)) {
    throw new Error('The compiler loader does not export a module factory.');
  }
  // LLVM flushes within diagnostic lines. Capture bytes instead of treating
  // Emscripten's print callbacks as complete lines.
  let stdout: number[] = [];
  let stderr: number[] = [];
  const decoder = new TextDecoder();
  const loaded: unknown = await loader.default({
    locateFile: file => new URL(file, base).href,
    wasmBinary: new Uint8Array(wasm),
    getPreloadedPackage: (name, size) => {
      if (!name.endsWith('Compiler.data') || size !== data.byteLength) {
        throw new Error('The compiler loader and data package do not match.');
      }
      return data;
    },
    stdout: byte => stdout.push(byte),
    stderr: byte => stderr.push(byte)
  });
  if (!module(loaded)) {
    throw new Error('The compiler runtime is missing required exports.');
  }
  const version = loaded.ccall('wasmbolt_version', 'string', [], []);
  const backends = loaded.ccall('available_targets', 'string', [], []);
  if (typeof version !== 'string' || typeof backends !== 'string') {
    throw new Error('The compiler did not report its capabilities.');
  }
  if (version !== `LLVM ${manifest.version}`) {
    throw new Error('The compiler version does not match its manifest.');
  }
  const supported: Target[] = [];
  const names = backends.toLowerCase().split(',');
  if (names.some(name => name.includes('wasm'))) {
    supported.push('wasm32-unknown-emscripten');
  }
  if (names.some(name => name.includes('x86'))) {
    supported.push('x86_64-unknown-linux-gnu');
  }
  if (names.some(name => name.includes('aarch64'))) {
    supported.push('aarch64-unknown-linux-gnu');
  }
  const info: Info = {
    version,
    targets: supported,
    resourceDirectory: manifest.resourceDirectory
  };

  return {
    info,
    compile(request) {
      if (!supported.includes(request.options.target)) {
        throw new Error('This compiler does not include the selected target.');
      }
      const start = performance.now();
      const directory = `/workspace/request-${request.id}`;
      const plan = invocation(request, info, directory);
      const commands: string[] = [];
      stdout = [];
      stderr = [];
      loaded.FS.mkdirTree(directory);
      try {
        loaded.FS.writeFile(plan.source, request.source);
        let exitCode = 0;
        for (const arguments_ of plan.commands) {
          const command = serialize(arguments_);
          commands.push(command);
          const code = loaded.ccall(
            'run_command',
            'number',
            ['string'],
            [command]
          );
          if (typeof code !== 'number' || !Number.isInteger(code)) {
            throw new Error('The compiler returned an invalid exit status.');
          }
          exitCode = code;
          if (code !== 0) {
            break;
          }
        }
        const errors = decoder.decode(Uint8Array.from(stderr));
        return {
          id: request.id,
          assembly:
            exitCode === 0
              ? loaded.FS.readFile(plan.assembly, { encoding: 'utf8' })
              : '',
          diagnostics: diagnostics(errors),
          commands,
          stdout: decoder.decode(Uint8Array.from(stdout)),
          stderr: errors,
          exitCode,
          duration: performance.now() - start
        };
      } finally {
        for (const name of loaded.FS.readdir(directory)) {
          if (name !== '.' && name !== '..') {
            loaded.FS.unlink(`${directory}/${name}`);
          }
        }
        loaded.FS.rmdir(directory);
      }
    }
  };
}

function factory(
  value: unknown
): value is (options: IModuleOptions) => Promise<unknown> {
  return typeof value === 'function';
}

function module(value: unknown): value is IModule {
  if (
    !record(value) ||
    typeof value.ccall !== 'function' ||
    !record(value.FS)
  ) {
    return false;
  }
  const fs = value.FS;
  return [
    'mkdirTree',
    'writeFile',
    'readFile',
    'readdir',
    'unlink',
    'rmdir'
  ].every(name => typeof fs[name] === 'function');
}
