import { diagnostics } from '../compiler/diagnostics';
import { isInput, isOutput } from '../compiler/protocol';
import { invocation, serialize } from '../compiler/request';
import { options } from '../model';

const info = {
  version: 'LLVM 23.1.0',
  resourceDirectory: '/lib/clang/23',
  targets: [options.target]
};

describe('compiler requests', () => {
  it('retains each argument through GNU quoting', () => {
    expect(serialize(['clang++', 'a b', 'say "hi"', 'a\\b', ''])).toBe(
      '"clang++" "a b" "say \\"hi\\"" "a\\\\b" ""'
    );
    expect(() => serialize(['a\0b'])).toThrow('null bytes');
  });

  it('constructs the requested compiler pipeline', () => {
    const request = { id: 1, source: '', options };
    const plan = invocation(request, info, '/workspace/request-1');
    expect(plan.commands.map(command => command[0])).toEqual([
      'clang++',
      'opt',
      'llc'
    ]);
    expect(plan.commands[0]).toContain('-std=c++23');
    expect(plan.commands[0]).toContain('/include/c++/v1');
    expect(plan.commands[1]).toContain('-passes=default<O2>');
    expect(plan.commands[2]).toContain('-mtriple=wasm32-unknown-emscripten');
    expect(plan.source).toBe('/workspace/request-1/snippet.cpp');
  });

  it('does not supply the Wasm sysroot to native targets', () => {
    const plan = invocation(
      {
        id: 2,
        source: '',
        options: {
          language: 'c',
          optimization: 0,
          target: 'x86_64-unknown-linux-gnu'
        }
      },
      info,
      '/workspace/request-2'
    );
    expect(plan.commands[0]).toContain('-std=c23');
    expect(plan.commands[0]).toContain('/lib/clang/23/include');
    expect(plan.commands[0]).not.toContain('/include');
    expect(plan.commands[1]).toContain('-passes=default<O0>');
  });
});

describe('diagnostics', () => {
  it('parses source locations and global errors', () => {
    expect(
      diagnostics(
        [
          '/workspace/snippet.cpp:2:4: error: expected expression',
          '   invalid(',
          '   ^',
          '/include/thing.h:7:2: note: declared here',
          'clang: warning: argument unused',
          'fatal error: no input files'
        ].join('\n')
      )
    ).toEqual([
      {
        file: '/workspace/snippet.cpp',
        line: 2,
        column: 4,
        severity: 'error',
        message: 'expected expression'
      },
      {
        file: '/include/thing.h',
        line: 7,
        column: 2,
        severity: 'note',
        message: 'declared here'
      },
      {
        file: null,
        line: null,
        column: null,
        severity: 'warning',
        message: 'argument unused'
      },
      {
        file: null,
        line: null,
        column: null,
        severity: 'error',
        message: 'no input files'
      }
    ]);
  });
});

it('rejects malformed messages before they reach the compiler', () => {
  expect(isInput({ kind: 'compile', id: 1, request: { source: '' } })).toBe(
    false
  );
  expect(
    isOutput({ kind: 'ready', id: 1, info: { ...info, targets: ['bogus'] } })
  ).toBe(false);
  expect(isOutput({ kind: 'ready', id: 1, info })).toBe(true);
});
