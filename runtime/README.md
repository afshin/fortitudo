# Compiler runtime

Fortitudo vendors WasmBolt's compiler module and build recipe from revision
`6566da129fde331db3f4f24856c7ea56c2c4d71c` of
[WasmBolt](https://github.com/anutosh491/WasmBolt), by Anutosh Bhat. The MIT
notice is in `licenses/WasmBolt.txt`.

The baseline is Emscripten 4.0.9 and LLVM 23.1.0. `build.yml` and `host.yml`
retain upstream environment declarations. Exact package URLs and package hashes
are locked separately for macOS arm64, Linux x64, and the common Emscripten
target. `sources.json` pins the matching llc source files with SHA-256 hashes.
Build with `pixi run --as-is jlpm build:compiler`.

The wrapper preserves upstream exported functions, target initialization, Clang
invocation, LLVM option resets, opt pipeline, llc adaptation, dynamic loading
support, memory settings, and optional MLIR driver. The CMake file checks that
the expected llc main and InitLLVM statements exist before adapting them.
Removing InitLLVM prevents LLVM shutdown between invocations. Fortitudo changes
source paths and removes the upstream demo-page copying.

The build assembles a browser filesystem from the Emscripten sysroot and pinned
host prefix. It keeps upstream header and library packaging behavior. It does
not minimize the runtime or load the optional MLIR driver during initialization.
Clang resource headers appear at `/lib/clang/23`.

Generated assets live in the ignored `compiler/` directory. Its manifest records
compiler version, resource directory, provenance, file sizes, and SHA-256
hashes, including license files. `check:compiler` requires a complete source
build. The `stage` subcommand can inspect imported upstream assets, but marks
them as imported; they cannot pass production checks.

The Emscripten ES module stays separate from frontend bundles. A dedicated
module worker imports it with an explicit URL and resolves data and Wasm through
`locateFile`. All compiles use one worker, isolated request paths, and the Clang
→ LLVM IR → opt → llc pipeline. Raw stdout and stderr are captured as bytes
because LLVM can flush partway through a diagnostic line. Cancellation
terminates the worker rather than interrupting LLVM in place.

License notices for LLVM, Emscripten, and packages whose headers or libraries
are included are in `licenses/`. They are copied to every distribution. The
exact resolved package metadata remains in the environment locks.

The initial Wasm memory is 256 MiB, the stack is 32 MiB, and memory may grow.
Browser test attachments report actual Wasm linear-memory sizes and compile and
initialization timings. These measurements exclude browser, JavaScript,
filesystem, and compiled-code overhead; they are not total process memory.
