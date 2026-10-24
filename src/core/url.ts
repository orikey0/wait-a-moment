/**
 * Returns the parsed URL when the extension may inspect the page. Only http and https pages are
 * tracked; Chrome-internal, extension and file URLs are left alone.
 */
export function parseTrackableUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
}
