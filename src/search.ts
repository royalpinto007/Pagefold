import type { Article, Filters } from './types.js';

/**
 * Rank saved articles against a query.
 *
 * Deliberately not a fuzzy match. A reading list is small and personal: the
 * user usually remembers a word from the title or the site, and a fuzzy engine
 * answering "close enough" for a query they typed exactly is more annoying
 * than an empty result.
 *
 * Every term must appear somewhere, so adding a word always narrows. Where it
 * appears decides the order.
 */
export function scoreArticle(article: Article, terms: readonly string[]): number {
  if (!terms.length) return 0;

  const title = article.title.toLowerCase();
  const site = article.site.toLowerCase();
  const byline = article.byline.toLowerCase();
  // Joined once rather than per term: the body is the big string here.
  const body = article.paragraphs.join(' ').toLowerCase();

  let score = 0;
  for (const term of terms) {
    let termScore = 0;
    if (title.includes(term)) termScore += title.startsWith(term) ? 12 : 8;
    if (site.includes(term)) termScore += 5;
    if (byline.includes(term)) termScore += 3;
    if (body.includes(term)) termScore += 1;

    // Every term must land somewhere, otherwise this is not a match at all.
    if (termScore === 0) return 0;
    score += termScore;
  }
  return score;
}

export function parseQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

const SORTERS: Record<Filters['sort'], (a: Article, b: Article) => number> = {
  newest: (a, b) => b.savedAt - a.savedAt,
  oldest: (a, b) => a.savedAt - b.savedAt,
  longest: (a, b) => b.wordCount - a.wordCount,
  shortest: (a, b) => a.wordCount - b.wordCount,
};

/**
 * Filter and order the list for display.
 *
 * With a query, relevance wins and the chosen sort breaks ties. Without one,
 * the sort is the only ordering. Sorting by date while searching would bury
 * the best match under whatever was saved most recently.
 */
export function applyFilters(articles: readonly Article[], filters: Filters): Article[] {
  const terms = parseQuery(filters.query);
  const sorter = SORTERS[filters.sort] ?? SORTERS.newest;

  const rows = articles
    .filter((a) => (filters.unreadOnly ? !a.read : true))
    .map((article) => ({ article, score: scoreArticle(article, terms) }))
    .filter((row) => (terms.length ? row.score > 0 : true));

  rows.sort((x, y) => {
    if (terms.length && x.score !== y.score) return y.score - x.score;
    return sorter(x.article, y.article);
  });

  return rows.map((row) => row.article);
}

/**
 * A short excerpt around the first matching term, for the list row.
 *
 * Falls back to the opening of the article when nothing matches in the body,
 * which is the common case for a title-only hit.
 */
export function excerptFor(article: Article, terms: readonly string[], length = 140): string {
  const body = article.paragraphs.join(' ');
  if (!body) return '';

  if (terms.length) {
    const lower = body.toLowerCase();
    for (const term of terms) {
      const at = lower.indexOf(term);
      if (at === -1) continue;
      // Start a little before the hit so the term has context on both sides.
      const from = Math.max(0, at - Math.floor(length / 3));
      const slice = body.slice(from, from + length).trim();
      return (from > 0 ? '…' : '') + slice + (from + length < body.length ? '…' : '');
    }
  }

  return body.length <= length ? body : body.slice(0, length).trim() + '…';
}
