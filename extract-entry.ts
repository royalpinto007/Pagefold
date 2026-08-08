import { extract } from './src/readability.js';
import type { Extracted } from './src/types.js';

declare global {
  interface Window {
    __pagefoldExtracted?: Extracted;
  }
}

/**
 * The script injected into the page being saved.
 *
 * The result is parked on window rather than returned. esbuild wraps an IIFE
 * bundle in its own function, so the module's final expression is not the
 * script's completion value and chrome.scripting.executeScript resolves to
 * undefined. Handing off through a property and reading it in a second, tiny
 * injection is explicit and does not depend on how the bundler wraps things.
 *
 * The reader deletes the property, so nothing is left on the page.
 */
window.__pagefoldExtracted = { url: location.href, ...extract(document) };

export {};
