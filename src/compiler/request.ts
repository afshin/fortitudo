import type { Info, Request } from './types';

export type Invocation = Readonly<{
  source: string;
  assembly: string;
  commands: readonly (readonly string[])[];
}>;

/** Build the same Clang, opt, and llc pipeline used by WasmBolt. */
export function invocation(
  request: Request,
  info: Info,
  directory: string
): Invocation {
  const { language, target, optimization } = request.options;
  const source = `${directory}/snippet.${language === 'cpp' ? 'cpp' : 'c'}`;
  const ir = `${directory}/source.ll`;
  const optimized = `${directory}/optimized.ll`;
  const assembly = `${directory}/output.s`;
  const resources = info.resourceDirectory;
  const includes = target.startsWith('wasm32-')
    ? [
        '/include/wasm32-emscripten/c++/v1',
        '/include/c++/v1',
        `${resources}/include`,
        '/include/wasm32-emscripten',
        '/include'
      ]
    : [`${resources}/include`];
  const compatibility = target.startsWith('wasm32-')
    ? ['-Xclang', '-iwithsysroot/include/compat']
    : [];

  return {
    source,
    assembly,
    commands: [
      [
        language === 'cpp' ? 'clang++' : 'clang',
        '-x',
        language === 'cpp' ? 'c++' : 'c',
        language === 'cpp' ? '-std=c++23' : '-std=c23',
        '-fno-color-diagnostics',
        '-nostdinc',
        `-resource-dir=${resources}`,
        ...includes.flatMap(include => ['-isystem', include]),
        ...compatibility,
        `--target=${target}`,
        `-O${optimization}`,
        '-Xclang',
        '-disable-O0-optnone',
        '-S',
        '-emit-llvm',
        source,
        '-o',
        ir
      ],
      ['opt', '-S', `-passes=default<O${optimization}>`, ir, '-o', optimized],
      [
        'llc',
        `-mtriple=${target}`,
        '-filetype=asm',
        `-O${optimization}`,
        optimized,
        '-o',
        assembly
      ]
    ]
  };
}

/** Quote arguments for LLVM's GNU command-line tokenizer, not a shell. */
export function serialize(arguments_: readonly string[]): string {
  return arguments_
    .map(argument => {
      if (argument.includes('\0')) {
        throw new Error('Compiler arguments cannot contain null bytes.');
      }
      return `"${argument.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    })
    .join(' ');
}
