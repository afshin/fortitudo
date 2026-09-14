import type { Info, Options, Progress, Result } from './compiler/types';

export type Pane = 'source' | 'assembly' | 'diagnostics';

export type Area =
  | Readonly<{
      type: 'tab-area';
      widgets: readonly Pane[];
      currentIndex: number;
    }>
  | Readonly<{
      type: 'split-area';
      orientation: 'horizontal' | 'vertical';
      children: readonly Area[];
      sizes: readonly number[];
    }>;

export type Session = Readonly<{
  version: 1;
  source: string;
  options: Options;
  layout: Area | null;
}>;

export type State = Readonly<{
  source: string;
  options: Options;
  layout: Area | null;
  revision: number;
  status: 'idle' | 'loading' | 'ready' | 'compiling' | 'cancelled' | 'failed';
  info: Info | null;
  progress: Progress | null;
  active: Readonly<{ id: number; revision: number }> | null;
  result: Readonly<{ revision: number; value: Result }> | null;
  notice: string | null;
  position: Readonly<{ line: number; column: number; serial: number }> | null;
}>;

export type Action =
  | Readonly<{ type: 'source'; source: string }>
  | Readonly<{ type: 'options'; options: Options }>
  | Readonly<{ type: 'layout'; layout: Area | null }>
  | Readonly<{ type: 'begin'; id: number }>
  | Readonly<{ type: 'progress'; id: number; progress: Progress }>
  | Readonly<{ type: 'initialized'; id: number; info: Info; compile: boolean }>
  | Readonly<{ type: 'finished'; id: number; result: Result }>
  | Readonly<{ type: 'failed'; id: number; message: string }>
  | Readonly<{ type: 'cancelled' }>
  | Readonly<{ type: 'notice'; message: string }>
  | Readonly<{ type: 'navigate'; line: number; column: number }>;

export const options: Options = {
  language: 'cpp',
  target: 'wasm32-unknown-emscripten',
  optimization: 2
};

export const example = `int square(int x) {
  return x * x;
}
`;

/** Create an independent application state from a validated session. */
export function initial(session: Session | null = null): State {
  return {
    source: session?.source ?? example,
    options: session?.options ?? options,
    layout: session?.layout ?? null,
    revision: 0,
    status: 'idle',
    info: null,
    progress: null,
    active: null,
    result: null,
    notice: null,
    position: null
  };
}

/** State transitions are pure; an obsolete request cannot change results. */
export function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'source':
      return action.source === state.source
        ? state
        : { ...state, source: action.source, revision: state.revision + 1 };
    case 'options':
      return equalOptions(action.options, state.options)
        ? state
        : { ...state, options: action.options, revision: state.revision + 1 };
    case 'layout':
      return { ...state, layout: action.layout };
    case 'begin':
      return {
        ...state,
        active: { id: action.id, revision: state.revision },
        status: 'loading',
        progress: null,
        notice: null
      };
    case 'progress':
      return state.active?.id === action.id && state.status === 'loading'
        ? { ...state, progress: action.progress }
        : state;
    case 'initialized':
      return state.active?.id === action.id
        ? {
            ...state,
            info: action.info,
            status: action.compile ? 'compiling' : 'ready',
            progress: null,
            active: action.compile ? state.active : null
          }
        : state;
    case 'finished':
      return state.active?.id === action.id
        ? {
            ...state,
            status: 'ready',
            progress: null,
            active: null,
            result: { revision: state.active.revision, value: action.result }
          }
        : state;
    case 'failed':
      return state.active?.id === action.id
        ? {
            ...state,
            status: 'failed',
            progress: null,
            active: null,
            notice: action.message
          }
        : state;
    case 'cancelled':
      return { ...state, active: null, status: 'cancelled', progress: null };
    case 'notice':
      return { ...state, notice: action.message };
    case 'navigate':
      return {
        ...state,
        position: {
          line: action.line,
          column: action.column,
          serial: (state.position?.serial ?? 0) + 1
        }
      };
  }
}

export function stale(state: State): boolean {
  return state.result !== null && state.result.revision !== state.revision;
}

export function snapshot(state: State): Session {
  return {
    version: 1,
    source: state.source,
    options: state.options,
    layout: state.layout
  };
}

export function equalOptions(left: Options, right: Options): boolean {
  return (
    left.language === right.language &&
    left.target === right.target &&
    left.optimization === right.optimization
  );
}
