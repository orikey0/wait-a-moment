import { cp, rm } from 'node:fs/promises';
import { build } from 'esbuild';

const outDir = 'dist';

await rm(outDir, { recursive: true, force: true });
await build({
  entryPoints: {
    background: 'src/background/service-worker.ts',
    options: 'src/ui/options.ts',
    blocked: 'src/ui/blocked.ts',
  },
  outdir: outDir,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome116',
  loader: { '.csv': 'text' },
  legalComments: 'none',
  logLevel: 'info',
});
await cp('public', outDir, { recursive: true });
console.log(`Built the extension into ${outDir}/`);
