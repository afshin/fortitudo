/** Source languages supported by the core explorer. */
export type Language = 'c' | 'cpp';

/** Targets exposed when their backend is present in the runtime. */
export type Target =
  | 'wasm32-unknown-emscripten'
  | 'x86_64-unknown-linux-gnu'
  | 'aarch64-unknown-linux-gnu';

export type Optimization = 0 | 1 | 2 | 3;

export type Options = Readonly<{
  language: Language;
  target: Target;
  optimization: Optimization;
}>;

export type Info = Readonly<{
  version: string;
  resourceDirectory: string;
  targets: readonly Target[];
}>;

export type Request = Readonly<{
  id: number;
  source: string;
  options: Options;
}>;

export type Diagnostic = Readonly<{
  file: string | null;
  line: number | null;
  column: number | null;
  severity: 'error' | 'warning' | 'note';
  message: string;
}>;

export type Result = Readonly<{
  id: number;
  assembly: string;
  diagnostics: readonly Diagnostic[];
  commands: readonly string[];
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}>;

/** Ordinary compiler errors resolve; runtime failures reject. */
export interface ICompiler {
  initialize(): Promise<Info>;
  compile(request: Request): Promise<Result>;
  cancel(): void;
  dispose(): void;
}

export const targets: readonly Target[] = [
  'wasm32-unknown-emscripten',
  'x86_64-unknown-linux-gnu',
  'aarch64-unknown-linux-gnu'
];

export const labels: Readonly<Record<Target, string>> = {
  'wasm32-unknown-emscripten': 'WebAssembly',
  'x86_64-unknown-linux-gnu': 'x86-64',
  'aarch64-unknown-linux-gnu': 'AArch64'
};

export function isTarget(value: unknown): value is Target {
  return targets.some(target => target === value);
}

export function isOptions(value: unknown): value is Options {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return (
    'language' in value &&
    (value.language === 'c' || value.language === 'cpp') &&
    'target' in value &&
    isTarget(value.target) &&
    'optimization' in value &&
    [0, 1, 2, 3].some(level => level === value.optimization)
  );
}

export function isRequest(value: unknown): value is Request {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    Number.isSafeInteger(value.id) &&
    'source' in value &&
    typeof value.source === 'string' &&
    'options' in value &&
    isOptions(value.options)
  );
}
