import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters, excerptFor, parseQuery, scoreArticle } from '../src/search.js';
import type { Article } from '../src/types.js';

function article(over: Partial<Article> = {}): Article {
  return {
    id: over.id ?? 'id',
    url: 'https://example.com/a',
    title: 'Untitled',
    byline: '',
    site: 'example.com',
    paragraphs: [],
    savedAt: 0,
    wordCount: 0,
    read: false,
    progress: 0,
    ...over,
  };
}

describe('scoreArticle', () => {
  test('a title hit outranks a body hit', () => {
    const inTitle = article({ title: 'Rust ownership explained' });
    const inBody = article({ title: 'Something else', paragraphs: ['a note about rust'] });
    assert.ok(scoreArticle(inTitle, ['rust']) > scoreArticle(inBody, ['rust']));
  });

  test('a title that starts with the term outranks one that merely contains it', () => {
    const starts = article({ title: 'Rust for beginners' });
    const contains = article({ title: 'Learning Rust slowly' });
    assert.ok(scoreArticle(starts, ['rust']) > scoreArticle(contains, ['rust']));
  });

  test('every term must appear, so adding a word always narrows', () => {
    const a = article({ title: 'Rust ownership', paragraphs: ['borrow checker'] });
    assert.ok(scoreArticle(a, ['rust']) > 0);
    assert.equal(scoreArticle(a, ['rust', 'python']), 0);
  });

  test('no terms means no score, so an empty query never reorders the list', () => {
    assert.equal(scoreArticle(article({ title: 'anything' }), []), 0);
  });
});

describe('applyFilters', () => {
  const items = [
    article({ id: 'a', title: 'Rust ownership', savedAt: 300, wordCount: 100 }),
    article({ id: 'b', title: 'Python typing', savedAt: 200, wordCount: 900, read: true }),
    article({ id: 'c', title: 'A note on rust', savedAt: 100, wordCount: 50 }),
  ];

  test('sorts newest first by default', () => {
    const out = applyFilters(items, { query: '', sort: 'newest', unreadOnly: false });
    assert.deepEqual(
      out.map((a) => a.id),
      ['a', 'b', 'c']
    );
  });

  test('sorts by length when asked', () => {
    const out = applyFilters(items, { query: '', sort: 'longest', unreadOnly: false });
    assert.deepEqual(
      out.map((a) => a.id),
      ['b', 'a', 'c']
    );
  });

  test('unread only excludes read items', () => {
    const out = applyFilters(items, { query: '', sort: 'newest', unreadOnly: true });
    assert.deepEqual(
      out.map((a) => a.id),
      ['a', 'c']
    );
  });

  test('relevance wins over the sort while searching', () => {
    // 'c' is older than 'a', but both match; the stronger title hit leads.
    const out = applyFilters(items, { query: 'rust', sort: 'newest', unreadOnly: false });
    assert.deepEqual(
      out.map((a) => a.id),
      ['a', 'c']
    );
  });

  test('a query with no matches returns nothing rather than everything', () => {
    const out = applyFilters(items, { query: 'kubernetes', sort: 'newest', unreadOnly: false });
    assert.deepEqual(out, []);
  });
});

describe('excerptFor', () => {
  const body =
    'The quick brown fox jumps over the lazy dog and keeps running for a long while afterwards.';

  test('centres on the match rather than always starting at the top', () => {
    const a = article({ paragraphs: [body] });
    const excerpt = excerptFor(a, ['lazy'], 40);
    assert.ok(excerpt.includes('lazy'), `expected the match in: ${excerpt}`);
  });

  test('falls back to the opening when nothing matches in the body', () => {
    const a = article({ paragraphs: [body] });
    assert.ok(excerptFor(a, ['absent'], 20).startsWith('The quick'));
  });

  test('returns empty for an article with no body', () => {
    assert.equal(excerptFor(article(), ['x']), '');
  });
});

describe('parseQuery', () => {
  test('lowercases and drops empty tokens', () => {
    assert.deepEqual(parseQuery('  Rust   Ownership '), ['rust', 'ownership']);
  });
});
