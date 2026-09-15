# Fortitudo

Fortitudo is a browser-only compiler explorer for C, C++, LLVM IR, and MLIR in
JupyterLab, JupyterLite, and a standalone Lumino application. All three hosts
use the same workbench and workers. No kernel or remote compiler is needed.

The [web app](https://afshin.github.io/fortitudo/) opens the standalone
explorer. Select **Try in Jupyter** to use the explorer alongside C23 and C++23
notebooks. Both applications run in the browser.

Edit a function, choose a language, target, and optimization level, then select
**Compile** or press **Ctrl/Cmd+Enter**. One compilation generates every
applicable output from the same source revision. Changing output tabs never
compiles. Compilation runs in a worker, so editing remains available. **Cancel**
terminates that worker; the next compile loads a fresh one.

- C/C++: AST, LLVM IR before passes, optimized IR, analysis, function graphs,
  assembly, and object.
- LLVM IR: validated input IR, optimized IR, analysis, function graphs,
  assembly, and object.
- MLIR: transformed MLIR and operation graph.
- WebAssembly target with C/C++ or LLVM IR: also a linked Wasm module and its
  metadata.

Every build includes diagnostics, recorded commands, raw streams, stage timings,
and generated files. A failed stage preserves successful independent outputs.
Select a diagnostic to jump to its source location. **Compare** opens a second
output group, initially comparing LLVM IR before and after passes. Both groups
have independent selections and resizable widths. Text views provide line
numbers, search, copy, and download. Graphs have function selection, zoom, fit,
and DOT/SVG downloads. The Wasm inspector lists size, imports, exports, and
function signatures without executing the module.

The status strip shows download progress in MB, then preparation and compilation
activity. Diagnostics lists the individual compiler downloads and any loading
failure. Progress counts decoded asset bytes against their packaged sizes;
compressed network transfers may be smaller. Asset verification requires HTTPS
or a local server on localhost.

The defaults are C++23, WebAssembly, and O2. C23 and O0–O3 are available. The
packaged LLVM runtime reports WebAssembly, x86-64, and AArch64 backends. Native
targets produce inspection artifacts with Clang built-in headers only; the C/C++
system headers are for WebAssembly.

**Pipelines** exposes LLVM optimization, analysis, and MLIR passes. An empty
LLVM field follows the selected O level, for example `default<O2>`. Frontend
semantics and backend code generation also use that O level. The first IR view
has LLVM optimization passes disabled. Analysis defaults to dominator trees and
loops; MLIR defaults to `builtin.module(canonicalize,cse)`. LLVM inputs with
incompatible target triples or layouts report an error instead of being silently
retargeted. Changing language preserves your source; **Reset example**
explicitly replaces it with that language's example.

## Execution

**Run** reuses a current Wasm module, or builds it first if source or options
have changed. Compilation and inspection never execute generated code. The
separate runner worker initializes on the first Run. Choose an exported function
and enter its scalar arguments in the Run pane. Supported signatures are `i32`
or `f64` returns with zero, one, or two matching arguments, and `void()`.
Unsupported signatures remain visible. Pointer and aggregate values are not
marshaled. A compatible selection survives a rebuild; otherwise the runner
prefers supported `main`, then a sole callable export. Ambiguous exports require
selection. `main(i32, i32)` receives zero arguments and a null argv.

The pane shows the return value, stdout, stderr, status, and errors. Repeated
calls retain module state. **Reset execution**, **Stop**, timeout, traps, and
module replacement discard the runner without losing compilation artifacts. The
default execution timeout is 10 seconds, configurable in Pipelines; it starts
after initialization. Legitimate NaN returns are displayed as results. Execution
requires WebAssembly; native targets remain available for inspection.

## Commands, files, and sharing

The **Terminal** runs `clang`, `clang++`, `opt`, `llc`, `wasm-ld`, `mlir-opt`,
and `dot` through the compiler worker. It accepts single and double quotes,
backslash escapes, and `>` / `2>` redirection. Quote LLVM pipeline arguments
containing angle brackets. This is one tool invocation per command, without a
shell, pipelines, or input redirection. For example:

```text
opt "-passes=print<domtree>" -disable-output optimized.ll 2> tree.txt
dot -Tsvg .square.dot -o square.svg
```

The current directory is `/workspace`. Compile seeds it with source and all
generated files. Manual commands can use explicit libraries and compiler flags;
their output updates the workspace while completed build artifacts remain
unchanged. A new Compile replaces the workspace. Worker recovery retains its
latest snapshot. **Files** provides previews and downloads; select a manually
linked `.wasm` file and choose **Use module** to run it. Keep files under
`/workspace` to include them in snapshots and the runner's dependencies.

In standalone, **Share** copies a versioned URL containing source and semantic
compiler options. Opening it restores inputs without compiling or running.
Binaries, logs, layout, and execution state are excluded. Sharing is unavailable
in JupyterLab and JupyterLite, where sessions belong to the host workspace.

Source, pipeline options, output selections, comparison layout, pane sizes, and
execution timeout are saved by the host. Jupyter also keeps a browser copy
scoped to the current workspace, protecting recent edits while its workspace
writes are deferred. Reopening restores editing state without compiling. Output
is explicitly marked out of date when source or options change. Invalid saved
state opens a usable default session with feedback. Version 1 sessions migrate
to version 2, preserving source and split proportions and replacing the Assembly
pane with an output group selecting Assembly. Compiled artifacts, command files,
and running processes are not persisted.

## Running locally

The prebuilt extension requires JupyterLab 4.6 or later. Once the release is
published, install it with:

```sh
python -m pip install fortitudo
```

Restart JupyterLab and select **Open Fortitudo** in the launcher or command
palette. The wheel includes the compiler; installing it does not require Node or
a compiler build. The npm package also includes the runtime and exports the
shared workbench for applications that supply their own Lumino host.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the complete Pixi setup and build
sequence. The compiler is a separate heavyweight build; frontend builds require
its generated assets and verify their hashes.

For an already built checkout:

```sh
pixi run --as-is jupyter lab
pixi run --as-is jlpm serve
pixi run --as-is jlpm serve:standalone
```

In JupyterLab or JupyterLite, select **Open Fortitudo** in the launcher or
command palette. The Lite testbed is served on port 8080; the standalone preview
prints its local address. These commands run in separate terminals.

Built standalone and Lite directories can be served below a URL prefix. Keep
each site's `compiler` assets at their generated relative location. Serve `.js`
as JavaScript, `.wasm` as `application/wasm`, and `.data` as
`application/octet-stream`. Compilation works offline after initialization. MLIR
and execution each need their runtime assets loaded before offline use; offline
page reload is a separate feature.

## Architecture

- Pure model, request construction, and diagnostic parsing.
- One instance-owned store outside React.
- Lumino commands orchestrate semantic changes and compiler effects.
- Functional React views, with explicit store and CodeMirror bridges.
- A shared Lumino workbench owns workers and view lifecycles, with tab panels
  inside resizable split panels. Jupyter owns docking of the workbench itself.
- Thin Jupyter and standalone adapters supply shell, persistence, and share
  URLs.

The shared package entry exports these contracts. Only `src/jupyter/` imports
JupyterLab packages; the plugin retains `fortitudo:plugin`.

The compiler API now returns `Result.artifacts`, `Result.stages`, and
`Result.files` instead of `Result.assembly`. Artifacts carry their build ID,
kind, path, and text or binary content. Stages record status, commands, raw
streams, diagnostics, and duration. Consumers should select artifacts by kind
and account for partial failures. `ICompiler.compile` accepts stage progress;
`ICompiler.command` returns a stage and replacement workspace snapshot.
`Options` includes the three pipeline fields and the four input languages.
`IRunner`, `RunRequest`, `RunResult`, and `inspectWasm` are exported separately.
Treat all returned binary buffers as immutable; transport never detaches buffers
already owned by application state.

## C and C++ notebooks

Our JupyterLite site includes xeus-cpp 0.10.0, with C23 and C++23 kernels. Open
**Getting started.ipynb** or **C examples.ipynb** and choose **Run → Run All
Cells**. The examples use packaged standard library headers, define functions,
and reuse state across cells.

The notebook interpreter runs in its own browser worker. It is independent of
Fortitudo's compiler explorer: code, options, and results are not synchronized
between them. Its Clang version also differs from the explorer's LLVM runtime.
The first kernel start downloads the interpreter and its libraries. Browser
memory limits apply; native processes, native platform APIs, and arbitrary
native libraries are unavailable.

These kernels are included in our Lite site, not installed into native
JupyterLab by the Fortitudo Python package.

## Runtime and limits

The runtime is reproduced from WasmBolt with LLVM 23.1.0 and Emscripten 4.0.9.
[runtime/README.md](runtime/README.md) records its origin, pins, licenses, and
build details. Generated `compiler/manifest.json` records asset sizes and
SHA-256 hashes. Browser test attachments record timings and Wasm memory
observations.

Each initialized compiler or runner is large and reserves 256 MiB of initial
Wasm memory, with memory growth enabled and a 32 MiB stack. Running a program
alongside the compiler therefore requires two instances. Browser memory limits
still apply. Cancellation releases the worker; a later compile must initialize
another. Initialization and runtime failures offer a retry path. Ordinary
compiler errors retain diagnostics and raw output.

The optional MLIR driver downloads only when MLIR is used, with the same
integrity checks, progress, cancellation, and retry behavior as the core. MLIR
exploration uses explicit passes; automatic lowering to an executable, automatic
compilation, and notebook synchronization remain outside this port.

## Acknowledgments

Fortitudo’s browser compiler runtime is based on
[WasmBolt](https://github.com/anutosh491/WasmBolt), created by Anutosh Bhat and
released under the MIT License. We reuse WasmBolt’s compiler module, LLVM
lifecycle adaptations, and compilation pipeline, with an adapted build recipe.
Fortitudo adds the shared React/Lumino workbench, compiler worker service, and
JupyterLab, JupyterLite, and standalone integrations. WasmBolt’s original
copyright and license notice are included in our distributions.

The compiler itself is provided by LLVM/Clang and built for WebAssembly using
Emscripten.

Our notebook environment uses
[xeus-cpp](https://github.com/compiler-research/xeus-cpp), CppInterOp, and
[jupyterlite-xeus](https://github.com/jupyterlite/xeus), with browser packages
from [emscripten-forge](https://github.com/emscripten-forge/recipes). Their work
makes interactive C and C++ notebooks possible without a server. The Lite build
preserves package license notices alongside the kernel assets.

## License

Fortitudo is BSD-3-Clause licensed. The compiler incorporates WasmBolt and other
separately licensed software. Required notices are included in
`runtime/licenses/` and copied into each distribution.
