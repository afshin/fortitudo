# Releasing Fortitudo

Staging, commits, version changes, tags, and publication are the user's
responsibility. Agents must not run those operations as part of development or
packaging checks.

Follow CONTRIBUTING.md to build the pinned compiler and all hosts, create npm
and Python archives, and run `test:packages` and the browser suite. Check the
generated compiler manifest, license notices, sizes, initialization timings,
compilation timings, and memory observations before distributing artifacts. A
frontend-only build is not a complete release.

`package.json` remains the version source for Python packaging. Avoid cleaning
ignored files as a release prerequisite: that would discard the compiler build,
local environments, and test artifacts unnecessarily.

The existing Jupyter Releaser workflows remain user-controlled. Their build hook
installs the locked Pixi environment and reproduces the compiler before building
frontend assets. They require the repository's existing release environment,
publishing credentials, and GitHub application configuration. The core explorer
implementation validates local packages; it does not publish a release or
exercise remote publishing credentials.
