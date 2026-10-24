import { spawnSync } from 'node:child_process';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

// Unit tests use Node's built-in test runner. Each test file is bundled first so that the
// TypeScript sources and the CSV asset can be imported without extra tooling.
const sourceDir = 'tests/unit';
const outDir = '.test-build';

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const entries = (await readdir(sourceDir))
  .filter((name) => name.endsWith('.test.ts'))
  .map((name) => path.join(sourceDir, name));

await build({
  entryPoints: entries,
  outdir: outDir,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  loader: { '.csv': 'text' },
  outExtension: { '.js': '.mjs' },
  logLevel: 'warning',
});

const outputs = (await readdir(outDir))
  .filter((name) => name.endsWith('.mjs'))
  .map((name) => path.join(outDir, name));

const result = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...outputs], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
