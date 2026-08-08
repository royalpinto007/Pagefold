import type { Article, Extracted } from './types.js';

/**
 * A stable id for a page.
 *
 * Derived from the URL with the noise stripped, so saving the same article
 * twice updates the existing entry instead of creating a near-duplicate. The
 * things stripped are the parts that identify a visit rather than a document:
 * tracking parameters, the fragment, and a trailing slash.
 */
export function articleId(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    // Not a URL we can normalise. Use it verbatim rather than dropping the save.
    return rawUrl;
  }

  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
      url.searchParams.delete(key);
    }
  }
  // Sorted, so ?a=1&b=2 and ?b=2&a=1 are the same document.
  url.searchParams.sort();

  let out = url.toString();
  if (out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'ref',
  'ref_src',
  'source',
  'spm',
  'yclid',
  '_hsenc',
  '_hsmi',
]);

/** Hostname without a leading www, for display. */
export function siteOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Words in the body. Used for the reading estimate and for sorting by length. */
export function countWords(paragraphs: readonly string[]): number {
  let total = 0;
  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (trimmed) total += trimmed.split(/\s+/).length;
  }
  return total;
}

/**
 * Reading time in whole minutes, never less than one.
 *
 * 220 words per minute is the middle of the range usually quoted for adult
 * silent reading of general prose. The exact figure matters less than being
 * stable: a number that jumps around looks broken.
 */
export function readingMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 220));
}

/** Build the stored record from what the page gave us. */
export function toArticle(extracted: Extracted, now: number): Article {
  const paragraphs = extracted.paragraphs.map((p) => p.trim()).filter(Boolean);
  return {
    id: articleId(extracted.url),
    url: extracted.url,
    title: extracted.title.trim() || siteOf(extracted.url) || 'Untitled',
    byline: extracted.byline.trim(),
    site: siteOf(extracted.url),
    paragraphs,
    savedAt: now,
    wordCount: countWords(paragraphs),
    read: false,
    progress: 0,
  };
}

/**
 * Merge a re-save over an existing record.
 *
 * The body and title are refreshed, because the page may have been updated.
 * Read state and progress are kept, because they belong to the reader, not to
 * the document, and silently marking something unread again is worse than a
 * slightly stale flag.
 */
export function mergeResave(existing: Article, incoming: Article): Article {
  return {
    ...incoming,
    savedAt: existing.savedAt,
    read: existing.read,
    progress: existing.progress,
  };
}
