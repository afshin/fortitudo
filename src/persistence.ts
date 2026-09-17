import { isOptions, isOutputKind } from './compiler/types';
import { isTimeout } from './compiler/execution';
import { isRecord } from './compiler/protocol';
import { isToolArea } from './model';
import type { Area, Pane, Session } from './model';

export interface IPersistence {
  load(): Promise<unknown>;
  save(session: Session): Promise<void>;
}

const panes: readonly Pane[] = [
  'source',
  'outputs',
  'diagnostics',
  'files',
  'terminal',
  'run',
  'pipelines'
];

/** Validate editing state without initializing the compiler. */
export function session(value: unknown): Session | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.source !== 'string' ||
    !isOptions(value.options)
  ) {
    return null;
  }
  const seen = new Set<Pane>();
  const layout = value.layout === null ? null : area(value.layout, seen, 0);
  if (
    value.layout !== null &&
    (!layout || !panes.every(pane => seen.has(pane)))
  ) {
    return null;
  }
  const { outputs, timeout } = value;
  if (
    !isRecord(outputs) ||
    !isOutputKind(outputs.primary) ||
    !isOutputKind(outputs.comparison) ||
    !isTimeout(timeout)
  ) {
    return null;
  }
  return {
    version: 1,
    source: value.source,
    options: value.options,
    layout,
    outputs: { primary: outputs.primary, comparison: outputs.comparison },
    timeout
  };
}

function pane(value: unknown): Pane | null {
  return [...panes, 'comparison' as const].find(pane => pane === value) ?? null;
}

function area(value: unknown, seen: Set<Pane>, depth: number): Area | null {
  if (!isRecord(value) || depth > 8) {
    return null;
  }
  if (value.type === 'tab-area') {
    if (
      !Array.isArray(value.widgets) ||
      value.widgets.length === 0 ||
      typeof value.currentIndex !== 'number' ||
      !Number.isInteger(value.currentIndex) ||
      value.currentIndex < -1 ||
      value.currentIndex >= value.widgets.length
    ) {
      return null;
    }
    const widgets = value.widgets.map(pane);
    if (!widgets.every((value): value is Pane => value !== null)) {
      return null;
    }
    if (value.currentIndex === -1 && !isToolArea(widgets)) {
      return null;
    }
    for (const widget of widgets) {
      if (seen.has(widget)) {
        return null;
      }
      seen.add(widget);
    }
    return { type: 'tab-area', widgets, currentIndex: value.currentIndex };
  }
  if (
    value.type !== 'split-area' ||
    !['horizontal', 'vertical'].includes(String(value.orientation)) ||
    !Array.isArray(value.children) ||
    value.children.length < 2 ||
    value.children.length > panes.length + 1 ||
    !Array.isArray(value.sizes) ||
    value.sizes.length !== value.children.length ||
    !value.sizes.every(
      size => typeof size === 'number' && Number.isFinite(size) && size > 0
    )
  ) {
    return null;
  }
  const children = value.children.map(child => area(child, seen, depth + 1));
  if (!children.every((child): child is Area => child !== null)) {
    return null;
  }
  return {
    type: 'split-area',
    orientation: value.orientation === 'horizontal' ? 'horizontal' : 'vertical',
    children,
    sizes: value.sizes
  };
}
