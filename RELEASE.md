# Releasing Fortitudo

`package.json` is the version source. The first release is `0.1.0`; its tag
`v0.1.0` must be created by the maintainer before running the workflow. Staging,
commits, pushing, and tags remain the maintainer's responsibility. The workflows
never change versions, create commits or tags, or create GitHub releases.

## Publishing workflow

`publish-release.yml` is manually triggered from an existing stable version tag.
It rejects branches and tags that do not match the package version. Its
`destination` input selects `none` (the default), `pypi`, `npm`, or `both`.
Selecting a registry authorizes an actual public publish after the checks pass.

The workflow calls `build.yml` at the same revision. It rebuilds the pinned
compiler without restoring cached compiler output, builds every host, validates
package contents and metadata, runs the browser suite, and tests installation of
the wheel. Publication waits for all those jobs to pass. npm and PyPI then
receive separate artifacts in jobs with OIDC permission and no source checkout
or dependency installation. No GitHub App or registry token is required for
trusted publishing.

The wheel and source archive use core metadata 2.4, supported by the locked
Twine and publishing action. Review these together when updating packaging
tools. The wheel explicitly ignores Git exclusion patterns so the Wasm driver is
retained even though native `.so` files are normally excluded from Git.

The build produces these downloadable Actions artifacts:

- `npm-distribution`: the exact `fortitudo.tgz` to publish.
- `python-distributions`: the wheel and source archive.
- `distributions`: all packages, static sites, compiler manifest, and
  `dist/release.json` with archive sizes, hashes, and the source revision.
- `browser-results`: browser reports and compiler measurements.

`none` validates the entire release without publishing. It is also the first
step when setting up a new registry. A subsequent publishing run rebuilds and
validates the tag again; use that run's artifacts and measurements for review.

## One-time account setup

Both registries use the public repository `afshin/fortitudo` and the workflow
filename `publish-release.yml`. Enter the filename only, without
`.github/workflows/`.

Create GitHub environments named `pypi` and `npm` in the repository settings.
Restrict their deployment policies to tags matching `v*`. The workflow also
checks the full stable version. These environment names must match the registry
configuration exactly.

### PyPI

In [account publishing settings](https://pypi.org/manage/account/publishing/),
add a pending GitHub publisher with these values:

| Field             | Value                 |
| ----------------- | --------------------- |
| PyPI project name | `fortitudo`           |
| Owner             | `afshin`              |
| Repository        | `fortitudo`           |
| Workflow          | `publish-release.yml` |
| Environment       | `pypi`                |

PyPI creates the project on its first successful upload, and converts the
pending publisher to a normal publisher. A pending publisher does not reserve
the name. If the project already exists under your account, configure the same
publisher in its project settings instead.

See PyPI's [pending publisher documentation][pypi-pending]. The publishing
action generates attestations automatically. No PyPI API token goes into GitHub
secrets.

### npm

npm requires the package to exist before a trusted publisher can be added. The
first publish therefore uses your local npm login and 2FA. Do not publish a
placeholder: use the full, tested `0.1.0` archive from the successful workflow.
Keep jlpm for dependency installation and packing; use npm only for registry
operations, because npm implements the trusted publishing flow.

After the maintainer has committed the release files, pushed them, and created
and pushed `v0.1.0`, run the checks without publishing:

```sh
gh workflow run publish-release.yml --repo afshin/fortitudo \
  --ref v0.1.0 -f destination=none
```

Find the completed run in Actions and download `npm-distribution` to a new empty
directory. With `RUN_ID` set to that successful run number:

```sh
gh run download "$RUN_ID" --repo afshin/fortitudo \
  --name npm-distribution --dir work/npm-0.1.0
pixi run --as-is npm login --registry https://registry.npmjs.org
pixi run --as-is npm publish work/npm-0.1.0/fortitudo.tgz \
  --dry-run --ignore-scripts --access public \
  --registry https://registry.npmjs.org
```

Check the archive against `dist/release.json` in the same run's `distributions`
artifact. When ready to publish the first npm release, run:

```sh
pixi run --as-is npm publish work/npm-0.1.0/fortitudo.tgz \
  --ignore-scripts --access public --tag latest \
  --registry https://registry.npmjs.org
```

This is the public npm `0.1.0` release. A local first publish has no GitHub OIDC
provenance; later automated releases do. npm cannot overwrite that version.

Then add the trusted publisher in npm's package settings:

| Field                | Value                                |
| -------------------- | ------------------------------------ |
| Provider             | GitHub Actions                       |
| Organization or user | `afshin`                             |
| Repository           | `fortitudo`                          |
| Workflow filename    | `publish-release.yml`                |
| Environment          | `npm`                                |
| Allowed action       | Direct publishing with `npm publish` |

With the Pixi-provided npm CLI, the equivalent command is:

```sh
pixi run --as-is npm trust github fortitudo \
  --repo afshin/fortitudo --file publish-release.yml \
  --env npm --allow-publish
```

npm may request 2FA. See [npm trusted publishing][npm-trusted] and the [npm
trust command][npm-trust]. Trusted publishing requires npm 11.5.1 or later and
Node 22.14.0 or later. The publication job pins Node 24.19.0.

## Publish 0.1.0 to PyPI

Once its pending publisher is configured and the tagged checks pass:

```sh
gh workflow run publish-release.yml --repo afshin/fortitudo \
  --ref v0.1.0 -f destination=pypi
```

Use `pypi` for this first automated run if npm `0.1.0` was already published
locally. Do not select `both` and attempt to republish it.

Verify the registry metadata and install the published wheel in a fresh Python
environment with JupyterLab:

```sh
pixi run --as-is npm view fortitudo@0.1.0 version dist.integrity
python -m pip install 'jupyterlab>=4.6,<5' 'fortitudo==0.1.0'
jupyter labextension list
```

Open Fortitudo and compile a function to confirm the installed compiler assets.
The maintainer can then create GitHub release notes against the existing tag.
Publication never starts on an ordinary push or pull request.

## Later releases and recovery

After changing the version and preparing a new stable tag, use the same checks
and select `both`. The npm `latest` tag follows stable releases. Prerelease
versions are deliberately rejected by this workflow.

If one registry succeeds and the other fails, rerun only the failed job in the
same Actions run. Its successful build artifacts remain available, and the
successful registry is untouched. Do not delete a release or change a published
tag to retry. If correcting the source is necessary, prepare a new version. The
workflow does not silently skip existing versions or ignore upload errors.

Keep the compiler manifest and measurements with the release. The local check
`pixi run --as-is python scripts/release.py` requires exactly the three current
archives, validates names and versions, runs Twine with strict metadata checks,
and performs an npm publish dry run. Existing package checks verify every
compiler asset, including the optional Wasm driver, in the wheel rebuilt from
the source distribution.

PyPI's [default limits][pypi-limits] are 100 MB per file and 10 GB per project.
The compiler makes each current archive approximately 60 MiB. Review the exact
sizes in each run; a larger runtime may need a limit increase before publishing.

[pypi-pending]:
  https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/
[pypi-limits]: https://docs.pypi.org/project-management/storage-limits/
[npm-trusted]: https://docs.npmjs.com/trusted-publishers/
[npm-trust]: https://docs.npmjs.com/cli/v11/commands/npm-trust/
