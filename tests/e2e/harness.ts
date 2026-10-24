import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import type { Reply, Request, Snapshot } from '../../src/shared/messages';

export const EXTENSION_DIR = path.resolve('dist');

export interface Site {
  port: number;
  close: () => Promise<void>;
}

/**
 * A local web server for test pages. Host names under .localhost resolve to this machine in
 * Chrome, so rules can target them without touching the network.
 */
export async function startSite(): Promise<Site> {
  const server: Server = createServer((request, response) => {
    const host = request.headers.host ?? '';
    const title = host.startsWith('site-a.')
      ? 'Site A'
      : host.startsWith('site-b.')
        ? 'Site B'
        : 'Open page';
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head>` +
        `<body><h1>${title}</h1><p>${request.url}</p></body></html>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    port,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        }),
      ),
  };
}

export interface Harness {
  context: BrowserContext;
  extensionId: string;
  openExtensionPage: (file: string) => Promise<Page>;
}

/** Starts Chromium with the built extension loaded. The same profile directory keeps data across runs. */
export async function launchHarness(profileDir: string): Promise<Harness> {
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).hostname;
  return {
    context,
    extensionId,
    openExtensionPage: async (file: string) => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/${file}`);
      return page;
    },
  };
}

/** Sends a request to the service worker from an extension page, exactly as the real UI does. */
export function send<R extends Request>(page: Page, message: R): Promise<Reply<R>> {
  return page.evaluate(
    (payload: Request) => chrome.runtime.sendMessage<Request, unknown>(payload),
    message,
  ) as Promise<Reply<R>>;
}

export async function snapshotOf(page: Page): Promise<Snapshot> {
  const reply = await send(page, { type: 'admin.snapshot' });
  if (!reply.ok) throw new Error(`admin.snapshot failed: ${reply.error}`);
  return reply.snapshot;
}
