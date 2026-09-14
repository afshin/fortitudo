import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const result = spawnSync(
  'jupyter',
  ['lite', 'build', '--output-dir', '_output'],
  { cwd: resolve(import.meta.dirname, '../lite'), stdio: 'inherit' }
);
if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
