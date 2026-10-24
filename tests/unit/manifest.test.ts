import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Tests run from the repository root (see `npm test`).
interface Manifest {
  manifest_version: number;
  permissions?: string[];
  host_permissions?: string[];
  optional_host_permissions?: string[];
  content_scripts?: unknown[];
  background: { service_worker: string; type: string };
  minimum_chrome_version?: string;
}

const manifest = JSON.parse(readFileSync(path.join('public', 'manifest.json'), 'utf8')) as Manifest;

describe('extension manifest', () => {
  it('uses Manifest V3 with a module service worker', () => {
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.background.service_worker, 'background.js');
    assert.equal(manifest.background.type, 'module');
  });

  it('requests only the two permissions it actually uses', () => {
    assert.deepEqual([...(manifest.permissions ?? [])].sort(), ['storage', 'webNavigation']);
  });

  it('asks for no website access and injects no content scripts', () => {
    assert.equal(manifest.host_permissions, undefined);
    assert.equal(manifest.optional_host_permissions, undefined);
    assert.equal(manifest.content_scripts, undefined);
  });

  it('targets a Chrome version that supports every API it calls', () => {
    assert.ok(Number(manifest.minimum_chrome_version) >= 116);
  });
});
