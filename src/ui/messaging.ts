import type { Reply, Request } from '../shared/messages';

/** Sends a request to the service worker. A failed connection becomes an "internal" failure. */
export async function send<R extends Request>(request: R): Promise<Reply<R>> {
  try {
    return await chrome.runtime.sendMessage<R, Reply<R>>(request);
  } catch {
    return { ok: false, error: 'internal' } as unknown as Reply<R>;
  }
}
