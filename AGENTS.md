# Fortitudo Agent Instructions

Fortitudo is a browser-only compiler explorer for JupyterLab, JupyterLite, and a
standalone Lumino application. The hosts share the same application.

## Engineering principles

Write highly idiomatic, beautiful code. Small details are part of the work:
formatting, naming, imports, API shape, types, and module boundaries deserve the
same care as behavior. Do not defer the nitpicks to a cleanup pass.

Prefer simple, explicit designs and small, complete changes. Read this file,
README.md, and the relevant source and configuration before editing. Read
CONTRIBUTING.md and RELEASE.md when working on development or packaging.
Distinguish the existing implementation from intended architecture. State
uncertainty honestly and verify unfamiliar APIs against official docs or
upstream source; do not invent signatures or conventions.

## Git ownership

Git staging and commits are the user's responsibility.

- Never stage, unstage, commit, or amend changes.
- Never reset, rebase, merge, cherry-pick, revert, stash, clean, or switch
  checkouts. Do not create or alter branches, tags, worktrees, or Git config.
- Do not otherwise manipulate Git state or history, including through release
  tools or scripts that perform these operations indirectly.
- Read-only inspection of status, diffs, and history is welcome. Disable
  optional Git locks for inspection with `GIT_OPTIONAL_LOCKS=0`.
- Preserve existing user changes. Edit only the files needed for the task; do
  not discard unrelated work or perform repository-wide cleanup.

## Architecture

- Keep domain logic pure: immutable data, reducers, selectors, request
  construction, and output parsing. Functions return new state instead of
  mutating existing state. Domain code has no React, Lumino, DOM, or host
  dependencies.
- Keep semantic application state outside React. Source, compiler options,
  results, diagnostics, and compilation status belong to the model/store. Focus,
  selection, refs, and transient presentation state may remain local.
- Use Lumino commands as the controller layer. Commands orchestrate model
  updates and effects. Register shared commands against a `CommandRegistry` and
  explicit application services, not a `JupyterFrontEnd` instance.
- Use pure functional React components as views. Components render supplied
  state and invoke callbacks wired to commands. They do not compile, persist, or
  mutate application state directly. Keep subscriptions and imperative editor
  integration in small, explicit bridges outside the pure views.
- Use Lumino widgets and layout for workbench composition. The shared React
  bridge extends a Lumino widget, not JupyterLab's `ReactWidget`.
- Keep JupyterLab/JupyterLite and standalone hosts thin. Hosts supply shell
  integration, asset URLs, settings, and restoration as needed. Only the Jupyter
  integration layer may import `@jupyterlab/*` in production code.
- Keep compilation and runtime I/O behind a small, typed compiler service. Run
  compilation in a worker; keep compiler effects out of the pure model. Make
  asset resolution explicit so deployments work below any base path.
- Require no server, kernel, or remote compilation service. Compilation must
  work without network access once the necessary static assets are loaded.
- Keep one repository with clear module boundaries and host entry points. Do not
  introduce a package split, framework, or abstraction without a concrete need.

## Style and vocabulary

- Keep hand-written source and prose lines at or below 80 characters. Preserve
  unavoidable long URLs, literal data, and generated content rather than
  corrupting them. Rework code that a formatter leaves unnecessarily long; a
  formatter's print width is not a substitute for review.
- Use two-space indentation, single quotes, and no trailing commas, as in the
  current formatter configuration. Keep the four-space package.json override.
  Follow the configured style instead of introducing a rival one.
- Prefer a small, coherent vocabulary of precise domain words. Use the same word
  for the same concept; do not accumulate synonyms or pattern names such as
  manager, handler, and helper when a domain name is clearer.
- Prefer short names when they remain unambiguous. Like-for-like shadowing in a
  nested scope is acceptable when it reinforces the same meaning.
- Keep APIs small, deliberate, and well organized. Export only what callers
  need. Group related functions and types by domain; use namespaces when they
  clarify that relationship. Avoid catch-all utils or helpers modules.
- Prefer functions to classes except for framework lifecycle contracts or a
  concrete resource-ownership need. Keep functions focused and explicit.
- Prefer map, filter, find, and Object.fromEntries for clear transformations.
  Avoid repeatedly spreading an accumulator in reduce. Use reduce for real
  aggregation and ordinary loops when they make control flow clearer.
- Keep imports minimal and consistently grouped: external packages first, then
  relative imports, with a blank line between groups. Keep related imports
  together; use type-only imports where appropriate.
- Follow existing casing: PascalCase for types/classes, camelCase for
  functions/values, and I-prefixed interfaces as required by ESLint.
- Centralize command IDs in CommandIDs; use `fortitudo:command-name` values.
  Preserve `fortitudo:plugin` for the existing Jupyter plugin.
- Namespace shared CSS with `fortitudo-` and provide standalone defaults for
  theme values. Put Jupyter-specific theme integration in the host layer.
- Document exported contracts and non-obvious decisions. Explain reasons and
  invariants; avoid comments that merely restate the code.
- Leave no dead code, speculative compatibility layers, duplicate paths, or
  unfinished placeholders as a substitute for completing the requested work.

## Types, effects, and lifecycle

- Use strict TypeScript and readonly data where appropriate. Prefer
  discriminated unions for mutually exclusive states and compiler messages.
- Do not use any to bypass the type system. Validate unknown input and command
  arguments with guards instead of unchecked casts.
- Choose null or optional fields according to their domain meaning. Do not
  import Correxit's cryptographic serialization rules into this project.
- Prefer promises for one compilation. Use async generators only when an actual
  pull-based sequence warrants them; do not copy streaming machinery without a
  need.
- Define ownership of workers, subscriptions, timers, editor instances, and
  React roots. Release them when their owner is disposed.
- Handle failed initialization, compilation errors, cancellation, and stale
  results explicitly. An older request must not replace newer results.
- Present actionable errors through application state. Keep raw compiler output
  available; do not hide errors or leave rejected promises unhandled.
- Do not leave debug console.log calls. Use console.warn or console.error only
  for useful diagnostic details, without substituting them for feedback.

## Development and validation

- Use Pixi for the shared development environment and jlpm for JavaScript
  dependencies. Preserve the familiar command vocabulary with `pixi run`; do not
  add Pixi aliases that merely shadow jlpm or Jupyter commands.
- Install the locked Pixi environment before building. It provides Node, Python,
  JupyterLab, the extension builder, packaging tools, and JupyterLite. Use
  `pixi run --as-is` after installation; do not silently use unrelated global or
  system environments.
- Use a single Yarn lockfile per existing package; do not introduce npm or pnpm
  lockfiles or mix package managers. Declare direct runtime dependencies
  explicitly instead of relying on JupyterLab's transitive dependencies.
- Keep package.json as the version source for Python packaging. Do not run
  release/version commands or change versions unless specifically requested; the
  Git ownership rules still apply.
- Use project configuration for TypeScript checks. Do not invoke tsc with a
  source filename and thereby bypass tsconfig.json. Cover all source, host,
  worker, and test files in the appropriate project configurations.
- Useful commands, once the environment is ready:
  - `pixi run --as-is jlpm build`
  - `pixi run --as-is jlpm lint:check`
  - `pixi run --as-is jlpm test`
  - `pixi run --as-is jlpm watch`
  - From the repository root: `pixi run --as-is jlpm test:browser`
- Prefer check commands before automatic fixes. Do not reformat unrelated files.
  Rebuild frontend changes before relying on browser test results.
- Test pure logic and isolated compiler/controller contracts with focused unit
  tests. Use a real Lumino registry where practical. Do not construct elaborate
  Jupyter mocks to test integration behavior.
- Use Playwright/Galata for live host behavior and real worker/asset loading.
  Verify JupyterLab, JupyterLite, and standalone builds, including non-root
  deployment paths. Run focused browser tests while debugging.
- Test meaningful behavior and failure modes rather than placeholders or tests
  that repeat the implementation. Documentation-only changes need
  formatting/content review, not a full application build.
- Keep generated bundles and compiler assets out of hand-written source. Record
  their upstream origin, version, licenses, and reproducible staging process
  when adding them. Inspect the final packages for required assets.
- Report what changed, the checks actually run, and any remaining limits. Do not
  claim a build, test, or host works without evidence.
