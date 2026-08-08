/**
 * Article extraction, kept deliberately small.
 *
 * A full Readability port is a large dependency to audit and ship for a
 * zero-network extension whose whole pitch is that you can see everything it
 * does. This does the part that matters: find the densest block of prose,
 * take its paragraphs, and drop the furniture.
 *
 * Everything here is pure and takes a Document, so it is testable without a
 * browser and reusable from the content script.
 */

/** Elements that never contain the article, whatever the page structure. */
const FURNITURE =
  'script,style,noscript,nav,header,footer,aside,form,button,iframe,svg,figure figcaption,' +
  '[role="navigation"],[role="banner"],[role="complementary"],[role="search"],[aria-hidden="true"]';

/** Class or id fragments that reliably mark chrome rather than content. */
const NOISE =
  /(^|[-_])(nav|menu|sidebar|footer|header|comment|share|social|promo|banner|ad|advert|cookie|newsletter|subscribe|related|recirc|breadcrumb|pagination|modal|popup|toolbar|byline|meta)([-_]|$)/i;

/** Containers worth scoring as a possible article body. */
const CANDIDATES = 'article,main,[role="main"],section,div';

export interface ExtractResult {
  title: string;
  byline: string;
  paragraphs: string[];
}

/**
 * Score a container by how much of it is prose.
 *
 * Text length alone picks the <body>, which contains everything. Dividing by
 * link density is what separates an article from a list of links: a nav block
 * can be long, but almost all of its text sits inside anchors.
 */
export function scoreContainer(el: Element): number {
  const text = (el.textContent ?? '').trim();
  if (text.length < 200) return 0;

  const identifier = `${el.className || ''} ${el.id || ''}`;
  if (NOISE.test(identifier)) return 0;

  let linkChars = 0;
  for (const anchor of el.querySelectorAll('a')) {
    linkChars += (anchor.textContent ?? '').length;
  }
  const linkDensity = linkChars / text.length;
  // Mostly links: a nav, a card grid, a related-posts rail.
  if (linkDensity > 0.5) return 0;

  const paragraphs = el.querySelectorAll('p').length;
  // Paragraph count is weighted because prose comes in paragraphs; a single
  // enormous div of text is more often a transcript dump or a comment thread.
  return text.length * (1 - linkDensity) + paragraphs * 120;
}

/** The highest scoring container, or the body when nothing scores. */
export function findArticleRoot(doc: Document): Element {
  let best: Element = doc.body;
  let bestScore = 0;

  for (const el of doc.querySelectorAll(CANDIDATES)) {
    const score = scoreContainer(el);
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

/** Paragraph text from a root, with furniture and boilerplate removed. */
export function paragraphsFrom(root: Element): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const node of root.querySelectorAll('p,h2,h3,li,blockquote,pre')) {
    if (node.closest(FURNITURE)) continue;

    const identifier = `${node.className || ''} ${node.id || ''}`;
    if (NOISE.test(identifier)) continue;

    const text = collapse(node.textContent ?? '');
    // Short fragments are captions, tags, "share this", and menu items.
    if (text.length < 25) continue;
    // Repeated blocks are almost always template furniture.
    if (seen.has(text)) continue;

    seen.add(text);
    out.push(text);
  }
  return out;
}

/** The page title, preferring what the page tells sharers over the tab title. */
export function titleFrom(doc: Document): string {
  const meta =
    attr(doc, 'meta[property="og:title"]') ||
    attr(doc, 'meta[name="twitter:title"]') ||
    collapse(doc.querySelector('h1')?.textContent ?? '');
  if (meta) return meta;

  // Tab titles usually carry a site suffix: "Some article - The Site".
  const raw = collapse(doc.title);
  return raw.split(/\s+[|–—-]\s+/)[0] || raw;
}

/** Author or publication, when the page declares one. */
export function bylineFrom(doc: Document): string {
  return (
    attr(doc, 'meta[name="author"]') ||
    attr(doc, 'meta[property="article:author"]') ||
    collapse(doc.querySelector('[rel="author"],.byline,.author')?.textContent ?? '') ||
    attr(doc, 'meta[property="og:site_name"]')
  );
}

function attr(doc: Document, selector: string): string {
  return collapse(doc.querySelector(selector)?.getAttribute('content') ?? '');
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Everything together: the entry point the content script calls. */
export function extract(doc: Document): ExtractResult {
  const root = findArticleRoot(doc);
  let paragraphs = paragraphsFrom(root);

  // A scored container that yields nothing usable is worse than no scoring at
  // all, so fall back to the whole document before giving up.
  if (paragraphs.length < 2 && root !== doc.body) {
    paragraphs = paragraphsFrom(doc.body);
  }

  return {
    title: titleFrom(doc),
    byline: bylineFrom(doc),
    paragraphs,
  };
}
