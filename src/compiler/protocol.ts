import type { Info, Request, Result } from './types';
import { isRequest, isTarget } from './types';

export type Input =
  | Readonly<{ kind: 'initialize'; id: number; base: string }>
  | Readonly<{ kind: 'compile'; id: number; request: Request }>;

export type Output =
  | Readonly<{ kind: 'ready'; id: number; info: Info }>
  | Readonly<{ kind: 'result'; id: number; result: Result }>
  | Readonly<{ kind: 'error'; id: number; message: string }>;

export function isInput(value: unknown): value is Input {
  if (!record(value) || !Number.isSafeInteger(value.id)) {
    return false;
  }
  return (
    (value.kind === 'initialize' && typeof value.base === 'string') ||
    (value.kind === 'compile' && isRequest(value.request))
  );
}

export function isOutput(value: unknown): value is Output {
  if (!record(value) || !Number.isSafeInteger(value.id)) {
    return false;
  }
  if (value.kind === 'error') {
    return typeof value.message === 'string';
  }
  if (value.kind === 'ready') {
    const info = value.info;
    return (
      record(info) &&
      typeof info.version === 'string' &&
      typeof info.resourceDirectory === 'string' &&
      Array.isArray(info.targets) &&
      info.targets.every(isTarget)
    );
  }
  if (value.kind !== 'result' || !record(value.result)) {
    return false;
  }
  const result = value.result;
  return (
    Number.isSafeInteger(result.id) &&
    typeof result.assembly === 'string' &&
    typeof result.stdout === 'string' &&
    typeof result.stderr === 'string' &&
    Number.isInteger(result.exitCode) &&
    typeof result.duration === 'number' &&
    Number.isFinite(result.duration) &&
    Array.isArray(result.commands) &&
    result.commands.every(command => typeof command === 'string') &&
    Array.isArray(result.diagnostics) &&
    result.diagnostics.every(diagnostic => {
      if (!record(diagnostic)) {
        return false;
      }
      return (
        (diagnostic.file === null || typeof diagnostic.file === 'string') &&
        (diagnostic.line === null || Number.isInteger(diagnostic.line)) &&
        (diagnostic.column === null || Number.isInteger(diagnostic.column)) &&
        ['error', 'warning', 'note'].includes(String(diagnostic.severity)) &&
        typeof diagnostic.message === 'string'
      );
    })
  );
}

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
