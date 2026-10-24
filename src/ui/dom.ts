import { strings } from '../shared/strings';

export interface ElOptions {
  className?: string;
  attrs?: Record<string, string>;
  text?: string;
  on?: Partial<Record<string, EventListener>>;
}

/** Small DOM builder. User-provided text always goes through textContent, never innerHTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElOptions = {},
  children: Array<Node | string | null | undefined> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    node.setAttribute(name, value);
  }
  if (options.text !== undefined) node.textContent = options.text;
  for (const [type, handler] of Object.entries(options.on ?? {})) {
    if (handler) node.addEventListener(type, handler);
  }
  node.append(
    ...children.filter((child): child is Node | string => child !== null && child !== undefined),
  );
  return node;
}

// The caller names the element type it expects; the generic parameter is what carries that.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

/** Fills elements marked with data-i18n from the string table. */
export function localize(root: ParentNode): void {
  for (const node of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const value: unknown = (strings as Record<string, unknown>)[node.dataset.i18n ?? ''];
    if (typeof value === 'string') node.textContent = value;
  }
}
