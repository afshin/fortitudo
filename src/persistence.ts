import { isOptions } from './compiler/types';
import { record } from './compiler/protocol';
import type { Area, Pane, Session } from './model';

export interface IPersistence {
  load(): Promise<unknown>;
  save(session: Session): Promise<void>;
}

/** Validate saved data before allowing it to configure application state. */
export function session(value: unknown): Session | null {
  if (
    !record(value) ||
    value.version !== 1 ||
    typeof value.source !== 'string' ||
    !isOptions(value.options)
  ) {
    return null;
  }
  if (value.layout === null) {
    return {
      version: 1,
      source: value.source,
      options: value.options,
      layout: null
    };
  }
  const seen = new Set<Pane>();
  const layout = area(value.layout, seen, 0);
  if (!layout || seen.size !== 3) {
    return null;
  }
  return {
    version: 1,
    source: value.source,
    options: value.options,
    layout
  };
}

function pane(value: unknown): value is Pane {
  return value === 'source' || value === 'assembly' || value === 'diagnostics';
}

function area(value: unknown, seen: Set<Pane>, depth: number): Area | null {
  if (!record(value) || depth > 8) {
    return null;
  }
  if (value.type === 'tab-area') {
    if (
      !Array.isArray(value.widgets) ||
      value.widgets.length === 0 ||
      !value.widgets.every(pane) ||
      typeof value.currentIndex !== 'number' ||
      !Number.isInteger(value.currentIndex) ||
      value.currentIndex < 0 ||
      value.currentIndex >= value.widgets.length
    ) {
      return null;
    }
    for (const widget of value.widgets) {
      if (seen.has(widget)) {
        return null;
      }
      seen.add(widget);
    }
    return {
      type: 'tab-area',
      widgets: value.widgets,
      currentIndex: value.currentIndex
    };
  }
  if (
    value.type !== 'split-area' ||
    (value.orientation !== 'horizontal' && value.orientation !== 'vertical') ||
    !Array.isArray(value.children) ||
    value.children.length < 2 ||
    value.children.length > 3 ||
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
    orientation: value.orientation,
    children,
    sizes: value.sizes
  };
}
