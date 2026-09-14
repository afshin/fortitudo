import {
  copyFileSync,
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync
} from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const prefix = resolve(root, 'work/xeus-cpp');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: resolve(root, 'lite'),
    stdio: 'inherit'
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// Recreate the prefix from the lock; package downloads remain cached.
rmSync(prefix, { recursive: true, force: true });
run('micromamba', [
  'create',
  '--yes',
  '--no-rc',
  '--no-pyc',
  '--root-prefix',
  resolve(root, '.cache/lite-mamba'),
  '--prefix',
  prefix,
  '--relocate-prefix',
  '',
  '--file',
  resolve(root, 'lite/xeus-cpp-lock.txt')
]);

// Match the explorer's language choices in the notebook launcher.
const kernels = resolve(prefix, 'share/jupyter/kernels');
for (const name of readdirSync(kernels)) {
  if (name !== 'xc23' && name !== 'xcpp23') {
    rmSync(resolve(kernels, name), { recursive: true });
  }
}

// A fresh output prevents old extensions or kernels surviving an update.
rmSync(resolve(root, 'lite/_output'), { recursive: true, force: true });
run('pixi', [
  'run',
  '--as-is',
  '--environment',
  'lite',
  'jupyter',
  'lite',
  'build',
  '--force',
  '--output-dir',
  '_output',
  `--XeusAddon.prefix=${prefix}`
]);
copyFileSync(
  resolve(root, 'style/icon.svg'),
  resolve(root, 'lite/_output/icon.svg')
);

const licenses = resolve(root, 'lite/_output/xeus/licenses');
mkdirSync(licenses, { recursive: true });
for (const file of readdirSync(resolve(prefix, 'conda-meta'))) {
  if (!file.endsWith('.json')) {
    continue;
  }
  const metadata = JSON.parse(
    readFileSync(resolve(prefix, 'conda-meta', file), 'utf8')
  );
  cpSync(
    resolve(metadata.link.source, 'info/licenses'),
    resolve(licenses, metadata.name),
    { recursive: true }
  );
}
copyFileSync(
  resolve(root, 'lite/xeus-cpp-lock.txt'),
  resolve(root, 'lite/_output/xeus/xeus-cpp-lock.txt')
);
